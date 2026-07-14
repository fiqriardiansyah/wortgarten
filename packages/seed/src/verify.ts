import './env';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { execFileSync } from 'child_process';
import { parseArgs } from 'util';
import { PrismaClient } from '@wortgarten/database';
import { clauseFinalTokenIndices, foldForLookup, tokenizeWithOffsets, type TokenSpan } from '@wortgarten/shared';
import { KaikkiEntrySchema } from './types';
import { harvestFormOfForms, isFormOfEntry } from './map';
import { buildLemmaSet } from './lemma-set';

const prisma = new PrismaClient();
const RAW_IN = path.join(__dirname, '..', 'data', 'german.jsonl');

interface CheckResult {
  name: string;
  pass: boolean;
  detail?: string;
}
const results: CheckResult[] = [];

function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
}

/**
 * True if a clause-final occurrence of `foldedPrefix` is reached from `fromPosition` WITHOUT
 * crossing an earlier clause boundary — mirrors resolveSeparableSentence's own clause-clearing
 * (a pending candidate is dropped the moment its clause closes), not just "any later clause-final
 * token", which would false-positive on an unrelated later clause's own clause-final word (verified
 * live: "Er las dir das, was er geschrieben hatte, vor." — the relative clause's own "hatte" is not
 * in the same clause as the outer "vor", so this must return false for that pair even though "vor"
 * is clause-final and comes later in the token stream).
 */
function clauseFinalPrefixReachable(spans: TokenSpan[], clauseFinal: Set<number>, fromPosition: number, foldedPrefix: string): boolean {
  if (clauseFinal.has(fromPosition)) return false; // the base verb's own occurrence already closes its clause — nothing can follow it
  for (let idx = fromPosition + 1; idx < spans.length; idx++) {
    if (clauseFinal.has(idx)) return foldForLookup(spans[idx].token) === foldedPrefix;
  }
  return false;
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

  // ─── Homograph splitting (the "die Bank" bug) ──────────────────────────────

  const bankLexemes = await prisma.lexeme.findMany({ where: { language, lemma: 'Bank', partOfSpeech: 'NOUN' }, include: { senses: true } });
  check('1. Bank (noun) → exactly 2 lexemes', bankLexemes.length === 2, JSON.stringify(bankLexemes.map((l) => ({ gender: l.gender, plural: l.plural }))));
  const bankBaenke = bankLexemes.find((l) => l.plural === 'Bänke');
  const bankBanken = bankLexemes.find((l) => l.plural === 'Banken');
  check('1. Bank → one lexeme plural "Bänke", one plural "Banken"', !!bankBaenke && !!bankBanken);

  const financialGloss = /financial institution/i;
  const benchGlosses = [/\bbench\b/i, /workbench/i, /substitutes'? bench/i];
  check(
    '2. "bank (financial institution)" sense belongs to the Banken lexeme, not Bänke',
    !!bankBanken?.senses.some((s) => financialGloss.test(s.translation)) && !bankBaenke?.senses.some((s) => financialGloss.test(s.translation)),
    JSON.stringify({ banken: bankBanken?.senses.map((s) => s.translation), baenke: bankBaenke?.senses.map((s) => s.translation) }),
  );
  check(
    '2. bench/workbench/substitutes\' bench senses belong to the Bänke lexeme, not Banken',
    benchGlosses.every((re) => bankBaenke?.senses.some((s) => re.test(s.translation))) &&
      !bankBanken?.senses.some((s) => benchGlosses.some((re) => re.test(s.translation))),
    JSON.stringify({ baenke: bankBaenke?.senses.map((s) => s.translation) }),
  );

  if (bankBanken && bankBaenke) {
    // Exact surface match, not the folded lookupForm() — "Bänken" (dative
    // plural of the bench sense) legitimately *folds* to the same normalized
    // key as "Banken" (umlaut-insensitive lookup is intentional, same as
    // "fur"/"für"), so a folded query would false-positive here. What must
    // never happen is the exact spelling "Banken" landing on the bench lexeme.
    const bankenExact = await prisma.wordForm.findMany({ where: { surface: 'Banken', lexeme: { language } }, include: { lexeme: true } });
    check(
      '7. exact surface "Banken" resolves only to the financial-institution Bank lexeme',
      bankenExact.length > 0 && bankenExact.every((f) => f.lexeme.id === bankBanken.id),
      JSON.stringify(bankenExact.map((f) => ({ lemma: f.lexeme.lemma, plural: f.lexeme.plural }))),
    );
    const baenkeExact = await prisma.wordForm.findMany({ where: { surface: 'Bänke', lexeme: { language } }, include: { lexeme: true } });
    check(
      '7. exact surface "Bänke" resolves only to the bench Bank lexeme',
      baenkeExact.length > 0 && baenkeExact.every((f) => f.lexeme.id === bankBaenke.id),
      JSON.stringify(baenkeExact.map((f) => ({ lemma: f.lexeme.lemma, plural: f.lexeme.plural }))),
    );
  }

  const schildLexemes = await prisma.lexeme.findMany({ where: { language, lemma: 'Schild', partOfSpeech: 'NOUN' } });
  check('3. Schild → 2 lexemes', schildLexemes.length === 2, JSON.stringify(schildLexemes.map((l) => ({ gender: l.gender, plural: l.plural }))));
  check(
    '3. Schild → one das (sign, NEUTER), one der (shield, MASCULINE)',
    schildLexemes.some((l) => l.gender === 'NEUTER') && schildLexemes.some((l) => l.gender === 'MASCULINE'),
  );

  const seeLexemes = await prisma.lexeme.findMany({ where: { language, lemma: 'See', partOfSpeech: 'NOUN' } });
  const seeGenders = new Set(seeLexemes.map((l) => l.gender));
  check('4. See → two lexemes, different genders (regression)', seeLexemes.length === 2 && seeGenders.size === 2, JSON.stringify([...seeGenders]));

  // umfahren: real frequency data only ranks the separable sense ("to run
  // someone over") into the top 5000 — the inseparable "to drive around"
  // sense scores far below the cutoff and legitimately isn't seeded. Assert
  // what's actually checkable: the separable sense is correctly tagged, and
  // if the inseparable one ever does get seeded (e.g. --limit raised), it
  // must land on a genuinely different lexeme, not merge with the separable one.
  const umfahrenLexemes = await prisma.lexeme.findMany({ where: { language, lemma: 'umfahren', partOfSpeech: 'VERB' } });
  const umfahrenSeparable = umfahrenLexemes.find((l) => l.separablePrefix === 'um');
  check(
    '5. umfahren → the separable sense (to run over) has separablePrefix "um" and past participle "umgefahren"',
    !!umfahrenSeparable && umfahrenSeparable.sourceKey.endsWith('|umgefahren'),
    JSON.stringify(umfahrenLexemes.map((l) => ({ id: l.id, separablePrefix: l.separablePrefix, sourceKey: l.sourceKey }))),
  );
  if (umfahrenLexemes.length === 2) {
    const umfahrenInseparable = umfahrenLexemes.find((l) => l.id !== umfahrenSeparable?.id);
    check(
      '5. umfahren → the inseparable sense (to drive around) is a distinct lexeme with no separablePrefix',
      umfahrenInseparable?.separablePrefix == null && umfahrenInseparable?.id !== umfahrenSeparable?.id,
    );
  }

  const seinLexemes = await prisma.lexeme.findMany({ where: { language, lemma: 'sein' } });
  const seinVerb = seinLexemes.find((l) => l.partOfSpeech === 'VERB');
  const seinPossessive = seinLexemes.find((l) => l.partOfSpeech !== 'VERB');
  check(
    '6. "sein" the verb (to be) and "sein" the possessive remain different lexemes (regression)',
    !!seinVerb && !!seinPossessive && seinVerb.id !== seinPossessive.id,
    JSON.stringify(seinLexemes.map((l) => ({ pos: l.partOfSpeech, id: l.id }))),
  );

  // 8. No lexeme has two different genders across its forms. A homograph
  // pair legitimately SHARES its bare lemma spelling and often its whole
  // regular case-declension paradigm too (der/das Fall, der/das Morgen —
  // real ambiguity, correctly left for the ranking layer to resolve, not a
  // bug). A *diminutive* is the sharpest signal for a real cross-attachment
  // bug (German diminutives are always grammatically neuter regardless of
  // their base noun's gender — verified live: "Händchen"/"Händlein",
  // diminutives of feminine "Hand", cross-attached onto an unrelated neuter
  // "Hand" homograph because gender coincidentally matched). But kaikki
  // itself sometimes declares ONE diminutive spelling as a form_of TWO
  // different base words (verified live: "Küchlein" is genuinely both "little
  // cake" (of Kuchen) and, rarely, "little kitchen" (of Küche); old/new
  // spelling pairs like Biss/Biß behave the same way) — that's real ambiguity
  // in the source, not a bug, so a bare "attached to >1 lexeme" check has
  // false positives. What's never legitimate is attaching to a lexeme whose
  // lemma ISN'T among the diminutive's own declared form_of targets — so
  // check against that, re-derived from the raw dump rather than guessed.
  const lemmaSet = await buildLemmaSet(RAW_IN);
  const rawDiminutiveTargets = new Map<string, Set<string>>();
  {
    const rl = readline.createInterface({ input: fs.createReadStream(RAW_IN, { encoding: 'utf-8' }), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const parsed = KaikkiEntrySchema.safeParse(JSON.parse(line));
      if (!parsed.success || !isFormOfEntry(parsed.data, lemmaSet)) continue;
      for (const harvest of harvestFormOfForms(parsed.data, lemmaSet)) {
        if (!harvest.isDiminutive) continue;
        const set = rawDiminutiveTargets.get(harvest.surface) ?? new Set<string>();
        set.add(harvest.targetLemma);
        rawDiminutiveTargets.set(harvest.surface, set);
      }
    }
  }
  const diminutiveForms = await prisma.wordForm.findMany({
    where: { lexeme: { language }, features: { path: ['raw'], array_contains: 'diminutive' } },
    include: { lexeme: { select: { lemma: true, gender: true } } },
  });
  const diminutiveContamination: string[] = [];
  for (const f of diminutiveForms) {
    const declared = rawDiminutiveTargets.get(f.surface);
    if (declared && !declared.has(f.lexeme.lemma)) {
      diminutiveContamination.push(`${f.surface} → attached to "${f.lexeme.lemma}" (${f.lexeme.gender}), but declared target(s) are: ${[...declared].join(', ')}`);
    }
  }
  check(
    '8. No diminutive WordForm attaches to a lexeme outside its own declared form_of target(s)',
    diminutiveContamination.length === 0,
    JSON.stringify(diminutiveContamination.slice(0, 10)),
  );

  // 9. Idempotency: re-run the loader against the data already in the DB.
  // Every row already exists with the same content, so the second run must
  // create/update nothing and must not touch any id (upsert against a
  // deterministic id is a true no-op when content hasn't changed).
  try {
    const loadScript = path.join(__dirname, '3-load.ts');
    const output = execFileSync('npx', ['ts-node', loadScript], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf-8',
      maxBuffer: 32 * 1024 * 1024,
      shell: true, // Windows: `npx` resolves to npx.cmd, which execFileSync can't exec directly without a shell
    });
    const created = Number(output.match(/lexemes created:\s*([\d,]+)/)?.[1]?.replace(/,/g, ''));
    const updated = Number(output.match(/lexemes updated:\s*([\d,]+)/)?.[1]?.replace(/,/g, ''));
    const sensesCreated = Number(output.match(/senses created:\s*([\d,]+)/)?.[1]?.replace(/,/g, ''));
    const sensesUpdated = Number(output.match(/senses updated:\s*([\d,]+)/)?.[1]?.replace(/,/g, ''));
    const formsLexemesChanged = Number(output.match(/lexemes w\/ forms changed:\s*([\d,]+)/)?.[1]?.replace(/,/g, ''));
    check(
      '9. Idempotency: re-running seed:load creates/updates nothing',
      created === 0 && updated === 0 && sensesCreated === 0 && sensesUpdated === 0 && formsLexemesChanged === 0,
      `created=${created} updated=${updated} sensesCreated=${sensesCreated} sensesUpdated=${sensesUpdated} formsLexemesChanged=${formsLexemesChanged}`,
    );
  } catch (err) {
    check('9. Idempotency: re-running seed:load creates/updates nothing', false, `seed:load errored: ${(err as Error).message}`);
  }

  // 10. Orphan report — Sense ids are keyed on gloss text (see map.ts's
  // senseSourceKey), so a future Wiktionary gloss edit orphans any UserWord
  // pointing at the old id. Report, never auto-delete (see 3-load.ts).
  const allSenseIds = new Set((await prisma.sense.findMany({ select: { id: true } })).map((s) => s.id));
  const allUserWords = await prisma.userWord.findMany({ select: { id: true, userId: true, senseId: true } });
  const orphanedUserWords = allUserWords.filter((uw) => !allSenseIds.has(uw.senseId));
  check('10. No orphaned UserWord rows (senseId with no matching Sense)', orphanedUserWords.length === 0, JSON.stringify(orphanedUserWords.slice(0, 10)));

  const bank = await lookupForm('Bank', language);
  const see = await lookupForm('See', language);

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

  // ─── "war → wär" bug: the dictionary genuinely contains lexemes glossed "alternative form
  // of X" — spelling variants kaikki still models as their own lemma. "wär" is one
  // ("alternative form of wäre") and happens to fold-match "war" as its own lemma, which would
  // wrongly outrank "sein" (simple past "war") under lemma-match alone.
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

  // ─── Example sentence corpus (Part 9 of the sentence-corpus spec) ─────────

  // 11. The central property: the same sentence carries different isUsableForTiles for an
  // ambiguous homograph vs. an unambiguous word in it. Found on real data, not a fixture — any
  // indexed sentence where one of the "Bank" lexemes (financial vs. bench — split into separate
  // Lexeme rows by the homograph-split fix, not separate senses on one) resolved with
  // senseId=null, paired with at least one other, unambiguous word in that same sentence that IS
  // usable. Checked against EITHER Bank lexeme, not a hardcoded one: exact-surface resolution
  // (see lexicon-index.ts) means plural forms like "Banken"/"Bänke" resolve unambiguously on
  // their own, so the ambiguous fallback for the shared bare-singular "Bank" spelling — which real
  // rankLexemes ties consistently break toward one particular lexeme — lands on whichever of the
  // two has the better frequencyRank, not necessarily the financial one.
  const bankLexemeIds = [bankBanken?.id, bankBaenke?.id].filter((id): id is string => !!id);
  if (bankLexemeIds.length > 0) {
    const ambiguousBankRow = await prisma.exampleWord.findFirst({ where: { lexemeId: { in: bankLexemeIds }, isUsableForTiles: false } });
    if (ambiguousBankRow) {
      const siblingUsable = await prisma.exampleWord.findFirst({
        where: { exampleId: ambiguousBankRow.exampleId, isUsableForTiles: true, lexemeId: { not: ambiguousBankRow.lexemeId } },
      });
      check(
        '11. same sentence, different flags: an ambiguous "Bank" row (isUsableForTiles=false, senseId=null) coexists with an unambiguous, usable word in the same sentence',
        !!siblingUsable,
        JSON.stringify({ exampleId: ambiguousBankRow.exampleId, ambiguousLexeme: ambiguousBankRow.lexemeId, siblingLexeme: siblingUsable?.lexemeId }),
      );
    } else {
      check('11. same sentence, different flags (Bank)', false, 'no ambiguous "Bank" ExampleWord row found in the indexed corpus — nothing to check');
    }
  }

  // 12. Inherits the homograph-split fix: an exact surface never crosses to the wrong Bank lexeme.
  if (bankBanken && bankBaenke) {
    const bankenWords = await prisma.exampleWord.findMany({ where: { surface: 'Banken' } });
    check(
      '12. every ExampleWord with surface "Banken" attaches only to the financial-institution Bank lexeme',
      bankenWords.length > 0 && bankenWords.every((w) => w.lexemeId === bankBanken.id),
      JSON.stringify([...new Set(bankenWords.map((w) => w.lexemeId))]),
    );
    const baenkeWords = await prisma.exampleWord.findMany({ where: { surface: 'Bänke' } });
    check(
      '12. every ExampleWord with surface "Bänke" attaches only to the bench Bank lexeme',
      baenkeWords.length > 0 && baenkeWords.every((w) => w.lexemeId === bankBaenke.id),
      JSON.stringify([...new Set(baenkeWords.map((w) => w.lexemeId))]),
    );
  }

  // 13. NULL is already impossible (translation is NOT NULL in the schema) — empty-string is the
  // practically-checkable analogue of "no real translation".
  const emptyTranslationCount = await prisma.example.count({ where: { translation: '' } });
  check('13. no Example row has an empty translation', emptyTranslationCount === 0, `count=${emptyTranslationCount}`);

  // 14. Every well-formed Example respects the 4–10 token window.
  const outOfRangeTokenCount = await prisma.example.count({
    where: { isWellFormed: true, OR: [{ tokenCount: { lt: 4 } }, { tokenCount: { gt: 10 } }] },
  });
  check('14. every well-formed Example has tokenCount between 4 and 10', outOfRangeTokenCount === 0, `count=${outOfRangeTokenCount}`);

  // 15. Every well-formed Example has ≥1 ExampleWord (pass 5 only indexes isWellFormed=true rows
  // — a well-formed sentence with zero resolved words would mean the vocabulary-in-range rule and
  // the indexer disagree with each other).
  const wellFormedExamples = await prisma.example.findMany({ where: { isWellFormed: true }, select: { id: true } });
  const exampleIdsWithWords = new Set(
    (await prisma.exampleWord.findMany({ select: { exampleId: true }, distinct: ['exampleId'] })).map((w) => w.exampleId),
  );
  const wellFormedWithoutWords = wellFormedExamples.filter((e) => !exampleIdsWithWords.has(e.id));
  check(
    '15. every well-formed Example has ≥1 ExampleWord',
    wellFormedWithoutWords.length === 0,
    `${wellFormedWithoutWords.length} well-formed examples with zero ExampleWord rows (first 5: ${wellFormedWithoutWords.slice(0, 5).map((e) => e.id).join(', ')})`,
  );

  // 16. No ExampleWord points outside the seeded dictionary for this language.
  const exampleWordLexemeIds = await prisma.exampleWord.findMany({ select: { lexemeId: true }, distinct: ['lexemeId'] });
  const seededLexemeIdSet = new Set((await prisma.lexeme.findMany({ where: { language }, select: { id: true } })).map((l) => l.id));
  const outsideSeed = exampleWordLexemeIds.filter((w) => !seededLexemeIdSet.has(w.lexemeId));
  check('16. no ExampleWord points at a lexeme outside the seed', outsideSeed.length === 0, JSON.stringify(outsideSeed.slice(0, 10)));

  // 17. Wiktionary examples arrive sense-exact — scoped to whichever ExampleWord rows the
  // Wiktionary pass writes for its own owning lexeme (see 4-examples.ts's wiktionary branch, not
  // yet implemented at the time this check was written — trivially passes with 0 rows until then).
  const wiktionaryWordsTotal = await prisma.exampleWord.count({ where: { example: { source: 'WIKTIONARY' } } });
  const wiktionaryWordsNullSense = await prisma.exampleWord.count({ where: { senseId: null, example: { source: 'WIKTIONARY' } } });
  check(
    '17. Wiktionary-sourced ExampleWord rows have a non-null senseId',
    wiktionaryWordsTotal === 0 || wiktionaryWordsNullSense === 0,
    `total=${wiktionaryWordsTotal} nullSense=${wiktionaryWordsNullSense}`,
  );

  // 18. Idempotency: re-run the indexer against data already in the DB. Every row already exists
  // with the same content, so the second run must create/update/delete nothing. Scoped to
  // seed:index (not seed:examples too, which would re-stream the full multi-hundred-thousand-line
  // Tatoeba TSV) — seed:index is the pass with real resolution logic worth re-verifying; a
  // content-hash upsert like seed:examples is idempotent by construction.
  try {
    const indexScript = path.join(__dirname, '5-index.ts');
    const output = execFileSync('npx', ['ts-node', indexScript], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
      shell: true, // Windows: `npx` resolves to npx.cmd, which execFileSync can't exec directly without a shell
    });
    const created = Number(output.match(/ExampleWord created:\s*([\d,]+)/)?.[1]?.replace(/,/g, ''));
    const updated = Number(output.match(/ExampleWord updated:\s*([\d,]+)/)?.[1]?.replace(/,/g, ''));
    const deletedStale = Number(output.match(/ExampleWord deleted \(stale\):\s*([\d,]+)/)?.[1]?.replace(/,/g, ''));
    check(
      '18. Idempotency: re-running seed:index creates/updates/deletes nothing',
      created === 0 && updated === 0 && deletedStale === 0,
      `created=${created} updated=${updated} deletedStale=${deletedStale}`,
    );
  } catch (err) {
    check('18. Idempotency: re-running seed:index creates/updates/deletes nothing', false, `seed:index errored: ${(err as Error).message}`);
  }

  // 19. The `normalized` @unique constraint holds across both sources — no sentence stored twice
  // under different content-hash ids.
  const normalizedDupes = await prisma.$queryRawUnsafe<{ normalized: string; cnt: bigint }[]>(
    'SELECT normalized, COUNT(*) as cnt FROM "Example" GROUP BY normalized HAVING COUNT(*) > 1 LIMIT 10',
  );
  check(
    '19. no sentence stored twice under different ids (normalized dedupe holds)',
    normalizedDupes.length === 0,
    JSON.stringify(normalizedDupes.map((d) => ({ normalized: d.normalized, count: Number(d.cnt) }))),
  );

  // 20. The concrete duplicate-collapse example from the spec: "Sie kann nicht Fahrrad fahren."
  // (deu_id 370133) has two English translations in the raw Tatoeba TSV (eng_id 314578, the
  // direct original, and eng_id 2673716, a looser paraphrase) — only the lowest eng_id survives.
  const fahrradExample = await prisma.example.findFirst({ where: { sourceRef: 'tatoeba:370133/314578' } });
  check(
    '20. duplicate German sentences collapsed correctly: "Sie kann nicht Fahrrad fahren." (deu_id 370133) keeps the lowest-eng_id translation',
    fahrradExample?.translation === "She can't ride a bicycle.",
    JSON.stringify(fahrradExample),
  );
  const fahrradOtherEngId = await prisma.example.findFirst({ where: { sourceRef: 'tatoeba:370133/2673716' } });
  check('20. the later, alternate translation (eng_id 2673716) was NOT kept as a separate row', !fahrradOtherEngId, JSON.stringify(fahrradOtherEngId));

  // ─── Verb-coverage fix (Part 5 of the spec): "never tested for ABSENCE" ──────
  // Every one of these stays permanently — each pins a real bug this fix removes.

  // 21. Every one of the top-500 highest-frequency WORD FORMS (the frequency list counts surface
  // forms, not lemmas) resolves to at least one seeded Lexeme. Would have caught "sich" — very
  // high frequency, silently absent from Lexeme entirely before the isFormOfEntry fix — at load
  // time, and catches anything that dies the same way in the future.
  const freqPath = path.join(__dirname, '..', 'data', 'de_50k.txt');
  const top500Words: string[] = [];
  if (fs.existsSync(freqPath)) {
    const rl = readline.createInterface({ input: fs.createReadStream(freqPath, { encoding: 'utf-8' }), crlfDelay: Infinity });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [word] = trimmed.split(/[\t ]+/);
      if (word) top500Words.push(word);
      if (top500Words.length >= 500) break;
    }
  }
  const missingTop500: string[] = [];
  for (const word of top500Words) {
    const matches = await lookupForm(word, language);
    if (matches.length === 0) missingTop500.push(word);
  }
  check(
    '21. Every top-500 highest-frequency word form resolves to a seeded Lexeme',
    top500Words.length > 0 && missingTop500.length === 0,
    top500Words.length === 0 ? 'frequency list not found — nothing to check' : JSON.stringify(missingTop500.slice(0, 30)),
  );

  // 22. "sich" specifically — the concrete bug this fix removes.
  const sichLexeme = await prisma.lexeme.findFirst({ where: { language, lemma: 'sich' } });
  check(
    '22. "sich" exists, with pos = PRONOUN',
    sichLexeme?.partOfSpeech === 'PRONOUN',
    sichLexeme ? JSON.stringify({ pos: sichLexeme.partOfSpeech, rank: sichLexeme.frequencyRank }) : 'missing',
  );

  // 23. General poisoning scan — the exact signature of the separable-verb reassembly bug: a
  // sentence attached to a BASE verb (e.g. "rufen") whose own text has that occurrence followed,
  // clause-finally, by a sibling separable verb's prefix (e.g. "an" → "anrufen", both real Lexeme
  // rows in this seed) should have been reassembled onto the separable verb instead. Scoped to
  // lexeme pairs that actually exist in the dictionary, not a coverage-count heuristic — most
  // separable verbs are rarer than their base and legitimately have fewer (or zero) examples, so a
  // bare "separable has none, base has many" threshold would flag ordinary corpus sparsity, not
  // just this bug. Every hit here is direct textual evidence of a mis-attached sentence.
  interface SiblingPair {
    base: { id: string; lemma: string };
    separable: { id: string; lemma: string };
    prefix: string;
  }
  const verbLexemesAll = await prisma.lexeme.findMany({ where: { language, partOfSpeech: 'VERB' }, select: { id: true, lemma: true, separablePrefix: true } });
  const baseVerbByLemma = new Map(verbLexemesAll.filter((l) => !l.separablePrefix).map((l) => [l.lemma, l]));
  const siblingPairs: SiblingPair[] = [];
  for (const l of verbLexemesAll) {
    if (!l.separablePrefix || !l.lemma.toLowerCase().startsWith(l.separablePrefix.toLowerCase())) continue;
    const base = baseVerbByLemma.get(l.lemma.slice(l.separablePrefix.length));
    if (base) siblingPairs.push({ base, separable: { id: l.id, lemma: l.lemma }, prefix: l.separablePrefix });
  }

  // The real algorithm only ever queues a merge candidate when the SEPARABLE sibling itself has a
  // WordForm row for the exact surface that matched the base verb (that's how "rufe" resolving
  // against "anrufen" triggers a pending candidate at all — see resolveSeparableSentence). A
  // separable verb with sparse conjugation-table coverage in kaikki can legitimately share no such
  // row with a given base-verb occurrence; that's a missing-data gap, not a mis-attachment, so it
  // must not count as a hit here.
  const separableIds = [...new Set(siblingPairs.map((p) => p.separable.id))];
  const separableForms = separableIds.length > 0 ? await prisma.wordForm.findMany({ where: { lexemeId: { in: separableIds } }, select: { lexemeId: true, surface: true } }) : [];
  const separableSurfaces = new Set(separableForms.map((f) => `${f.lexemeId}|${f.surface}`));

  const baseIds = [...new Set(siblingPairs.map((p) => p.base.id))];
  const baseWords =
    baseIds.length > 0 ? await prisma.exampleWord.findMany({ where: { lexemeId: { in: baseIds } }, include: { example: { select: { text: true } } } }) : [];
  const baseWordsByLexeme = new Map<string, typeof baseWords>();
  for (const w of baseWords) {
    const arr = baseWordsByLexeme.get(w.lexemeId) ?? [];
    arr.push(w);
    baseWordsByLexeme.set(w.lexemeId, arr);
  }
  const poisoned: string[] = [];
  for (const pair of siblingPairs) {
    for (const row of baseWordsByLexeme.get(pair.base.id) ?? []) {
      if (!separableSurfaces.has(`${pair.separable.id}|${row.surface}`)) continue;
      const text = row.example.text;
      const spans = tokenizeWithOffsets(text);
      const clauseFinal = clauseFinalTokenIndices(text, spans);
      const hit = clauseFinalPrefixReachable(spans, clauseFinal, row.position, foldForLookup(pair.prefix));
      if (hit) poisoned.push(`"${text}" → attached to "${pair.base.lemma}" but clause-final "${pair.prefix}" implies "${pair.separable.lemma}"`);
    }
  }
  check(
    '23. No sentence attached to a base verb is poisoned by a clause-final sibling separable-verb prefix',
    poisoned.length === 0,
    JSON.stringify(poisoned.slice(0, 10)),
  );

  // 24. "anrufen" has ≥1 tileable example — the reassembly is actually feeding the separable verb.
  const anrufenLexeme2 = await prisma.lexeme.findFirst({ where: { language, lemma: 'anrufen', partOfSpeech: 'VERB' } });
  const anrufenTileable = anrufenLexeme2 ? await prisma.exampleWord.count({ where: { lexemeId: anrufenLexeme2.id, isUsableForTiles: true } }) : 0;
  check('24. "anrufen" has ≥1 tileable example', anrufenTileable >= 1, `count=${anrufenTileable}`);

  // 25. The concrete historical pin: "rufen" (the base) has no row sourced from a sentence where
  // "an" is clause-final. Redundant with #23's general scan for this exact pair — kept as an
  // explicit, named regression test since this is the bug the whole fix is built around.
  const rufenLexeme = await prisma.lexeme.findFirst({ where: { language, lemma: 'rufen', partOfSpeech: 'VERB', separablePrefix: null } });
  const rufenPoisoned: string[] = [];
  if (rufenLexeme) {
    const rows = await prisma.exampleWord.findMany({ where: { lexemeId: rufenLexeme.id }, include: { example: { select: { text: true } } } });
    for (const row of rows) {
      const spans = tokenizeWithOffsets(row.example.text);
      const clauseFinal = clauseFinalTokenIndices(row.example.text, spans);
      const hit = clauseFinalPrefixReachable(spans, clauseFinal, row.position, 'an');
      if (hit) rufenPoisoned.push(row.example.text);
    }
  }
  check('25. "rufen" has no ExampleWord row sourced from a sentence where "an" is clause-final', rufenPoisoned.length === 0, JSON.stringify(rufenPoisoned.slice(0, 5)));

  // 26. The false-positive guard: "Ich denke an dich." must NOT merge "denke" + "an" — "an" sits
  // mid-clause (followed by "dich"), so it stays the preposition. Only checkable if Tatoeba
  // actually contains this exact sentence; trivially passes (like check 17) if it doesn't.
  const denkeExample = await prisma.example.findFirst({ where: { text: { equals: 'Ich denke an dich.', mode: 'insensitive' } } });
  if (denkeExample) {
    const denkeWords = await prisma.exampleWord.findMany({ where: { exampleId: denkeExample.id } });
    const falseMerge = denkeWords.some((r) => r.prefixSurface !== null && foldForLookup(r.surface) === 'denke');
    const anStandalone = denkeWords.some((r) => foldForLookup(r.surface) === 'an' && r.prefixPosition === null);
    check('26. "Ich denke an dich." does not merge "denke" + "an" (not clause-final)', !falseMerge && anStandalone, JSON.stringify(denkeWords));
  } else {
    check('26. "Ich denke an dich." does not merge "denke" + "an" (not clause-final)', true, 'sentence not present in corpus — nothing to check');
  }

  // ─── Split-lemma summary — the blast radius of this fix. Every (lemma, pos)
  // pair that now resolves to more than one Lexeme was previously merged into
  // one (wrongly, if the merge guard doesn't apply) or is a correctly-split
  // homograph. Read this list; it's not a pass/fail check.
  const allLexemes = await prisma.lexeme.findMany({ where: { language }, select: { lemma: true, partOfSpeech: true, frequencyRank: true } });
  const byLemmaPos = new Map<string, typeof allLexemes>();
  for (const l of allLexemes) {
    const key = `${l.lemma} ${l.partOfSpeech}`;
    const arr = byLemmaPos.get(key) ?? [];
    arr.push(l);
    byLemmaPos.set(key, arr);
  }
  const split = [...byLemmaPos.entries()]
    .filter(([, ls]) => ls.length > 1)
    .map(([key, ls]) => ({
      lemma: key.split(' ')[0],
      pos: key.split(' ')[1],
      count: ls.length,
      bestRank: Math.min(...ls.map((l) => l.frequencyRank ?? Infinity)),
    }))
    .sort((a, b) => a.bestRank - b.bestRank);

  console.log(`\n[verify] split-lemma summary: ${allLexemes.length} total lexemes, ${split.length} (lemma, pos) pairs split into >1 lexeme`);
  console.log('  top 20 by frequency:');
  for (const s of split.slice(0, 20)) {
    console.log(`    ${s.lemma} (${s.pos}) → ${s.count} lexemes, best rank ${s.bestRank}`);
  }

  // ─── Sentence corpus coverage report (Part 6) — the deliverable that decides the roadmap.
  // Descriptive, not a pass/fail check.
  console.log('\n[verify] ── sentence corpus coverage report ──────────────────');
  const bySource = await prisma.example.groupBy({ by: ['source'], _count: { _all: true } });
  for (const s of bySource) console.log(`  ${s.source}: ${s._count._all.toLocaleString()} ingested`);
  const totalExamples = await prisma.example.count();
  const wellFormedTotal = await prisma.example.count({ where: { isWellFormed: true } });
  console.log(`  total (deduped):        ${totalExamples.toLocaleString()}`);
  console.log(`  well-formed:            ${wellFormedTotal.toLocaleString()} (${totalExamples > 0 ? ((wellFormedTotal / totalExamples) * 100).toFixed(1) : '0.0'}%)`);

  const seededLexemesAll = await prisma.lexeme.findMany({ where: { language }, select: { id: true, lemma: true, partOfSpeech: true, frequencyRank: true } });
  const tileableLexemeIds = new Set(
    (await prisma.exampleWord.findMany({ where: { isUsableForTiles: true }, select: { lexemeId: true }, distinct: ['lexemeId'] })).map((w) => w.lexemeId),
  );
  const withCoverage = seededLexemesAll.filter((l) => tileableLexemeIds.has(l.id));
  console.log(`  lexemes with ≥1 tileable example: ${withCoverage.length.toLocaleString()}/${seededLexemesAll.length.toLocaleString()} (${((withCoverage.length / seededLexemesAll.length) * 100).toFixed(1)}%)`);

  const top1000 = seededLexemesAll.filter((l) => l.frequencyRank != null && l.frequencyRank <= 1000);
  const top1000WithCoverage = top1000.filter((l) => tileableLexemeIds.has(l.id));
  const top1000Pct = top1000.length > 0 ? (top1000WithCoverage.length / top1000.length) * 100 : 0;
  console.log(`  TOP-1000 lexemes with ≥1 tileable example: ${top1000WithCoverage.length.toLocaleString()}/${top1000.length.toLocaleString()} (${top1000Pct.toFixed(1)}%)  ← the number that matters`);

  // 27. Verb coverage in the top-1000 is ≥80% — the metric the whole fix is built around. Fail the
  // build below that.
  const top1000Verbs = top1000.filter((l) => l.partOfSpeech === 'VERB');
  const top1000VerbsWithCoverage = top1000Verbs.filter((l) => tileableLexemeIds.has(l.id));
  const top1000VerbPct = top1000Verbs.length > 0 ? (top1000VerbsWithCoverage.length / top1000Verbs.length) * 100 : 0;
  console.log(`  TOP-1000 VERBS with ≥1 tileable example: ${top1000VerbsWithCoverage.length.toLocaleString()}/${top1000Verbs.length.toLocaleString()} (${top1000VerbPct.toFixed(1)}%)`);
  check('27. Verb coverage in the top-1000 is ≥80%', top1000VerbPct >= 80, `${top1000VerbPct.toFixed(1)}% (${top1000VerbsWithCoverage.length}/${top1000Verbs.length})`);

  const tileableCountByLexeme = new Map<string, number>();
  const tileableWordsAll = await prisma.exampleWord.findMany({ where: { isUsableForTiles: true }, select: { lexemeId: true } });
  for (const w of tileableWordsAll) tileableCountByLexeme.set(w.lexemeId, (tileableCountByLexeme.get(w.lexemeId) ?? 0) + 1);
  const counts = seededLexemesAll.map((l) => tileableCountByLexeme.get(l.id) ?? 0).sort((a, b) => a - b);
  const median = counts.length === 0 ? 0 : counts.length % 2 === 1 ? counts[(counts.length - 1) / 2] : (counts[counts.length / 2 - 1] + counts[counts.length / 2]) / 2;
  console.log(`  median tileable examples per lexeme: ${median}`);

  const starved = seededLexemesAll.filter((l) => !tileableLexemeIds.has(l.id)).sort((a, b) => (a.frequencyRank ?? Infinity) - (b.frequencyRank ?? Infinity));
  console.log(`\n  starved list: ${starved.length.toLocaleString()} lexemes with zero tileable examples. Top 50 by frequency:`);
  for (const l of starved.slice(0, 50)) {
    console.log(`    ${l.frequencyRank}. ${l.lemma} (${l.partOfSpeech})`);
  }
  console.log('────────────────────────────────────────────────────────────');

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
