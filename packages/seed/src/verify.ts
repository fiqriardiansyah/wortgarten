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
