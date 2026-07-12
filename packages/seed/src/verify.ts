import './env';
import { parseArgs } from 'util';
import { PrismaClient } from '@wortgarten/database';
import { foldForLookup } from '@wortgarten/shared';

const prisma = new PrismaClient();

interface CheckResult {
  name: string;
  pass: boolean;
  detail?: string;
}
const results: CheckResult[] = [];

function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
}

async function lookupForm(surface: string, language: string) {
  const normalized = foldForLookup(surface);
  const forms = await prisma.wordForm.findMany({
    where: { normalized, lexeme: { language } },
    include: { lexeme: { include: { senses: true } } },
  });
  return forms.map(({ lexeme, ...form }) => ({ lexeme, form, senses: lexeme.senses }));
}

async function main() {
  const { values } = parseArgs({
    allowPositionals: true, // pnpm on Windows can forward a stray literal "--" token
    options: { language: { type: 'string', default: 'de' } },
  });
  const language = values.language as string;

  const kommt = await lookupForm('kommt', language);
  check('kommt → kommen', kommt.some((m) => m.lexeme.lemma === 'kommen'), JSON.stringify(kommt.map((m) => m.lexeme.lemma)));

  const hunde = await lookupForm('Hunde', language);
  check('Hunde → Hund', hunde.some((m) => m.lexeme.lemma === 'Hund'), JSON.stringify(hunde.map((m) => m.lexeme.lemma)));

  const schnelle = await lookupForm('schnelle', language);
  check(
    'schnelle → schnell (adjective in "Der schnelle Hund")',
    schnelle.some((m) => m.lexeme.lemma === 'schnell'),
    JSON.stringify(schnelle.map((m) => m.lexeme.lemma)),
  );

  const anrufenLexeme = await prisma.lexeme.findFirst({ where: { language, lemma: 'anrufen', partOfSpeech: 'VERB' } });
  check('anrufen has separablePrefix = "an"', anrufenLexeme?.separablePrefix === 'an', anrufenLexeme?.separablePrefix ?? 'missing');

  // Standalone reimplementation of apps/api LookupService's pending-verb
  // reassembly (small and self-contained on purpose — this package must not
  // depend on apps/api). Proves the *data* supports separable-verb lookup;
  // the algorithm itself is covered by apps/api/lookup.service.test.ts.
  const sentenceTokens = 'Ich rufe dich an.'.split(/\s+/).map((t) => t.replace(/[.,!?;:]+$/, ''));
  let merged: string | undefined;
  {
    const pending: { lemma: string; prefix: string }[] = [];
    for (const token of sentenceTokens) {
      const folded = foldForLookup(token);
      const p = pending.find((x) => foldForLookup(x.prefix) === folded);
      if (p) {
        merged = p.lemma;
        continue;
      }
      const matches = await lookupForm(token, language);
      for (const m of matches) {
        if (m.lexeme.partOfSpeech === 'VERB' && m.lexeme.separablePrefix) {
          pending.push({ lemma: m.lexeme.lemma, prefix: m.lexeme.separablePrefix });
        }
      }
    }
  }
  check('"Ich rufe dich an." → anrufen as one match', merged === 'anrufen', merged ?? 'no merge found');

  const bank = await lookupForm('Bank', language);
  const bankLexemes = bank.filter((m) => m.lexeme.lemma === 'Bank');
  check(
    'Bank → multiple senses',
    bankLexemes.length > 0 && bankLexemes[0].senses.length >= 2,
    JSON.stringify(bankLexemes.map((m) => m.senses.length)),
  );

  const see = await lookupForm('See', language);
  const seeGenders = new Set(see.filter((m) => m.lexeme.lemma === 'See').map((m) => m.lexeme.gender));
  check('See → two lexemes, different genders', seeGenders.size >= 2, JSON.stringify([...seeGenders]));

  // ─── "heute → heuen" bug: the data genuinely contains both a real lemma
  // match (the adverb) and a real form-only match (heuen's ich/er past tense)
  // for the same surface — proves the fix has something real to rank, not
  // just a synthetic test fixture. The ranking algorithm itself is unit-tested
  // in apps/api/lexicon/ranking.test.ts; this only checks the data shape.
  const heute = await lookupForm('heute', language);
  const heuteLemmaMatch = heute.find((m) => foldForLookup(m.lexeme.lemma) === 'heute' && m.lexeme.partOfSpeech === 'ADVERB');
  const heuenFormOnly = heute.find((m) => m.lexeme.lemma === 'heuen');
  check(
    '"heute" has both a real lemma match (adverb) and a real form-only match (heuen)',
    !!heuteLemmaMatch && !!heuenFormOnly,
    JSON.stringify(heute.map((m) => ({ lemma: m.lexeme.lemma, pos: m.lexeme.partOfSpeech }))),
  );

  // ─── Contractions: every base preposition a contraction resolves to must
  // actually exist, or the fix silently points at nothing. (The contraction
  // map itself is duplicated here in miniature — this package must not depend
  // on apps/api, same reason the separable-verb reassembly above is redone.)
  const CONTRACTION_BASES = ['in', 'an', 'zu', 'bei', 'von', 'auf', 'für', 'durch', 'um'];
  for (const base of CONTRACTION_BASES) {
    const baseLexeme = await prisma.lexeme.findFirst({ where: { language, lemma: { equals: base, mode: 'insensitive' } } });
    check(`contraction base preposition "${base}" exists in dictionary`, !!baseLexeme, baseLexeme ? `rank ${baseLexeme.frequencyRank}` : 'missing');
  }

  // ─── "war → wär" bug: the dictionary genuinely contains 82 lexemes glossed "alternative form
  // of X" — spelling variants kaikki still models as their own lemma. "wär" is one (rank 140,
  // "alternative form of wäre") and happens to fold-match "war" as its own lemma, which would
  // wrongly outrank "sein" (rank 13 — "war" is really its simple past) under lemma-match alone.
  // A miniature standalone reproduction of apps/api ranking.ts's marginal-variant tier + lemma-match
  // + frequency tiers (this package must not depend on apps/api, same reason as elsewhere in this file).
  const MARGINAL_GLOSS_PATTERN = /\balternative (form|spelling) of\b/i;
  // every(), not some(): a polysemous lexeme with one alt-of cross-reference sense among several real
  // ones (e.g. "er" — he/it/she — also glossed "alternative spelling of Er" for one narrow usage) is
  // not marginal; only a lexeme with no real sense of its own (every sense is an alt-of gloss) is.
  function isMarginalVariant(senses: { translation: string }[]): boolean {
    return senses.length > 0 && senses.every((s) => MARGINAL_GLOSS_PATTERN.test(s.translation));
  }
  function pickDominant(surface: string, matches: Awaited<ReturnType<typeof lookupForm>>) {
    return [...matches].sort((a, b) => {
      const marginal = Number(isMarginalVariant(a.senses)) - Number(isMarginalVariant(b.senses));
      if (marginal !== 0) return marginal;
      const lemmaMatch =
        Number(foldForLookup(surface) !== foldForLookup(a.lexeme.lemma)) - Number(foldForLookup(surface) !== foldForLookup(b.lexeme.lemma));
      if (lemmaMatch !== 0) return lemmaMatch;
      return (a.lexeme.frequencyRank ?? Infinity) - (b.lexeme.frequencyRank ?? Infinity);
    })[0];
  }

  const war = await lookupForm('war', language);
  const warDominant = pickDominant('war', war);
  check(
    '"war" → "sein" (to be), not the marginal alt-of lexeme "wär"',
    warDominant?.lexeme.lemma === 'sein',
    JSON.stringify(war.map((m) => ({ lemma: m.lexeme.lemma, rank: m.lexeme.frequencyRank, marginal: isMarginalVariant(m.senses) }))),
  );

  const mir = await lookupForm('mir', language);
  const mirDominant = pickDominant('mir', mir);
  check(
    '"mir" → "ich" (I), not the marginal alt-of lexeme "mir" (alternative form of "wir")',
    mirDominant?.lexeme.lemma === 'ich',
    JSON.stringify(mir.map((m) => ({ lemma: m.lexeme.lemma, rank: m.lexeme.frequencyRank, marginal: isMarginalVariant(m.senses) }))),
  );

  // ─── Casing data: "park" (lowercase) and "Park" (capitalized) must resolve
  // to genuinely different real lexemes for the casing signal to have
  // anything to rank between (the ranking itself is unit-tested elsewhere).
  const park = await lookupForm('park', language);
  const parkNoun = park.find((m) => m.lexeme.lemma === 'Park' && m.lexeme.partOfSpeech === 'NOUN');
  const parkenVerb = park.find((m) => m.lexeme.lemma === 'parken' && m.lexeme.partOfSpeech === 'VERB');
  check(
    '"park" has both a NOUN reading (Park) and a VERB reading (parken)',
    !!parkNoun && !!parkenVerb,
    JSON.stringify(park.map((m) => ({ lemma: m.lexeme.lemma, pos: m.lexeme.partOfSpeech }))),
  );

  for (const w of ['der', 'die', 'das', 'sein', 'haben']) {
    const lexeme = await prisma.lexeme.findFirst({ where: { language, lemma: w } });
    if (lexeme) {
      check(`"${w}" present in dictionary`, true, `rank ${lexeme.frequencyRank}`);
      continue;
    }
    // Real kaikki data models der/die/das as ONE lemma ("der") with die/das
    // as its declined forms (form_of), not three separate lemmas — a word
    // that's only reachable as an inflected form of another lexeme still counts.
    const viaForm = await lookupForm(w, language);
    check(
      `"${w}" present in dictionary`,
      viaForm.length > 0,
      viaForm.length > 0 ? `as a form of ${viaForm.map((m) => m.lexeme.lemma).join(', ')}` : 'missing',
    );
  }

  console.log('\n[verify] results:');
  let failed = 0;
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
    if (!r.pass) failed++;
  }
  console.log(`\n[verify] ${results.length - failed}/${results.length} passed`);

  await prisma.$disconnect();
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
