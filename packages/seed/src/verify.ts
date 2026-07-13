import './env';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { execFileSync } from 'child_process';
import { parseArgs } from 'util';
import { PrismaClient } from '@wortgarten/database';
import { foldForLookup } from '@wortgarten/shared';
import { KaikkiEntrySchema } from './types';
import { harvestFormOfForms, isFormOfEntry } from './map';

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
  const rawDiminutiveTargets = new Map<string, Set<string>>();
  {
    const rl = readline.createInterface({ input: fs.createReadStream(RAW_IN, { encoding: 'utf-8' }), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const parsed = KaikkiEntrySchema.safeParse(JSON.parse(line));
      if (!parsed.success || !isFormOfEntry(parsed.data)) continue;
      for (const harvest of harvestFormOfForms(parsed.data)) {
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

  console.log('\n[verify] results:');
  let failed = 0;
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
    if (!r.pass) failed++;
  }
  console.log(`\n[verify] ${results.length - failed}/${results.length} passed`);

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

  await prisma.$disconnect();
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
