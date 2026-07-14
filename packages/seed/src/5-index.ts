import './env';
import { parseArgs } from 'util';
import { PrismaClient } from '@wortgarten/database';
import { loadLexiconIndex, resolveSentence } from './lexicon-index';

// ─── Part 5: sense resolution from the English side of the pair ───────────

function stripParens(s: string): string {
  return s.replace(/\([^)]*\)/g, ' ');
}

/** Light English stemming so "runs"/"run" and "bury"/"buried" match — not a real stemmer,
 * just enough suffix-stripping to catch the common cases the spec calls out. */
function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length > 4 && (w.endsWith('ied') || w.endsWith('ies'))) return w.slice(0, -3) + 'y';
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Splits a sense's translation into candidate matching terms: strip parentheticals, split on
 * ',' and ';', drop a leading "to " (verb infinitives). Each term may be one word or a phrase. */
function extractCoreTerms(translation: string): string[] {
  const noParens = stripParens(translation);
  const terms: string[] = [];
  for (const raw of noParens.split(/[,;]/)) {
    const term = raw.trim().replace(/^to\s+/i, '').trim().toLowerCase();
    if (term) terms.push(term);
  }
  return terms;
}

function sentenceWordStems(sentence: string): Set<string> {
  const words = sentence.match(/[A-Za-z']+/g) ?? [];
  return new Set(words.map(stem));
}

/** True if any of the sense's core terms is found in the English sentence: single-word terms
 * match on a stemmed word, multi-word phrases require the exact phrase (word-boundary bounded). */
function senseMatchesTranslation(senseTranslation: string, sentenceTranslation: string, sentenceStems: Set<string>): boolean {
  const paddedSentence = ` ${sentenceTranslation.toLowerCase().replace(/[^a-z' ]+/g, ' ')} `;
  for (const term of extractCoreTerms(senseTranslation)) {
    const words = term.split(/\s+/).filter(Boolean);
    if (words.length === 1) {
      if (sentenceStems.has(stem(words[0]))) return true;
    } else {
      const phrase = words.join(' ');
      if (paddedSentence.includes(` ${phrase} `)) return true;
    }
  }
  return false;
}

interface ExampleWordRow {
  exampleId: string;
  lexemeId: string;
  senseId: string | null;
  position: number;
  surface: string;
  isUsableForTiles: boolean;
  prefixPosition: number | null;
  prefixSurface: string | null;
}

function exampleWordChanged(
  existing: { senseId: string | null; surface: string; isUsableForTiles: boolean; prefixPosition: number | null; prefixSurface: string | null },
  next: ExampleWordRow,
): boolean {
  return (
    existing.senseId !== next.senseId ||
    existing.surface !== next.surface ||
    existing.isUsableForTiles !== next.isUsableForTiles ||
    existing.prefixPosition !== next.prefixPosition ||
    existing.prefixSurface !== next.prefixSurface
  );
}

async function main() {
  const { values } = parseArgs({
    allowPositionals: true, // pnpm on Windows can forward a stray literal "--" token
    options: {
      language: { type: 'string', default: 'de' },
      'batch-size': { type: 'string', default: '500' },
    },
  });

  const language = values.language as string;
  const batchSize = Number(values['batch-size']);

  const prisma = new PrismaClient();
  const index = await loadLexiconIndex(prisma, language);
  console.log(`[index] loaded lexicon index: ${index.lexemesById.size.toLocaleString()} lexemes`);

  const examples = await prisma.example.findMany({ where: { isWellFormed: true }, select: { id: true, text: true, translation: true } });
  console.log(`[index] ${examples.length.toLocaleString()} well-formed examples to index`);

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let deleted = 0;
  let usableForTiles = 0;
  let unresolvedSense = 0;
  let skippedNoLexeme = 0;

  for (let i = 0; i < examples.length; i += batchSize) {
    const chunk = examples.slice(i, i + batchSize);
    const chunkIds = chunk.map((e) => e.id);

    const existingWords = await prisma.exampleWord.findMany({ where: { exampleId: { in: chunkIds } } });
    const existingByKey = new Map(existingWords.map((w) => [`${w.exampleId}|${w.lexemeId}|${w.position}`, w]));

    const rows: ExampleWordRow[] = [];
    for (const ex of chunk) {
      const slots = await resolveSentence(index, ex.text);
      const sentenceStems = sentenceWordStems(ex.translation);

      for (const slot of slots) {
        if (slot.unknown) {
          skippedNoLexeme++; // unresolved token: an allowlisted proper noun (no tile to drill) or, defensively, a dictionary gap
          continue;
        }

        // A merged 2-token slot (reassembled separable verb, e.g. "rufe" + "an" → anrufen) always
        // carries exactly one match — see resolveSeparableSentence — so lexeme identity is already
        // certain; only the sense (Part 4 below) is still open. A plain 1-token slot can still
        // carry several candidate LEXEMES (this dictionary splits homographs into separate Lexeme
        // rows, not separate senses on one — see the homograph-split fix: "Bank" the bench vs "Bank"
        // the financial institution) — that's the only case cross-lexeme ambiguity can still block usability.
        const matches = slot.matches;
        const position = slot.tokenIndices[0];
        const surface = slot.tokens[0];
        const prefixPosition = slot.tokens.length === 2 ? slot.tokenIndices[1] : null;
        const prefixSurface = slot.tokens.length === 2 ? slot.tokens[1] : null;

        let chosenLexemeId = matches[0].lexeme.id;
        let senseId: string | null = null;
        let isUsableForTiles = false;

        if (matches.length === 1) {
          // Identity is certain — usable regardless of how many senses this lexeme has (Part 4:
          // ambiguity ACROSS lexemes is fatal, ambiguity WITHIN one lexeme's senses is not).
          // senseId is a ranking preference (sense-exact sentences served first), never a gate.
          isUsableForTiles = true;
          const matchedSenses = matches[0].senses.filter((s) => senseMatchesTranslation(s.translation, ex.translation, sentenceStems));
          senseId = matchedSenses.length === 1 ? matchedSenses[0].id : null;
        } else if (matches.length > 1) {
          const lexemeMatches = matches
            .map((m) => ({ lexeme: m.lexeme, matchedSenses: m.senses.filter((s) => senseMatchesTranslation(s.translation, ex.translation, sentenceStems)) }))
            .filter((m) => m.matchedSenses.length > 0);
          if (lexemeMatches.length === 1) {
            chosenLexemeId = lexemeMatches[0].lexeme.id;
            senseId = lexemeMatches[0].matchedSenses.length === 1 ? lexemeMatches[0].matchedSenses[0].id : null;
            isUsableForTiles = true;
          }
        }

        if (isUsableForTiles) usableForTiles++;
        else unresolvedSense++;

        rows.push({ exampleId: ex.id, lexemeId: chosenLexemeId, senseId, position, surface, isUsableForTiles, prefixPosition, prefixSurface });
      }
    }

    const freshKeys = new Set(rows.map((r) => `${r.exampleId}|${r.lexemeId}|${r.position}`));
    // A row that existed before but isn't produced this run (e.g. the dictionary changed under
    // it) is pure liability, same reasoning as 3-load.ts's WordForm self-healing — delete it.
    const staleRows = existingWords.filter((w) => !freshKeys.has(`${w.exampleId}|${w.lexemeId}|${w.position}`));

    for (const r of rows) {
      const existing = existingByKey.get(`${r.exampleId}|${r.lexemeId}|${r.position}`);
      if (!existing) created++;
      else if (exampleWordChanged(existing, r)) updated++;
      else unchanged++;
    }

    await prisma.$transaction([
      ...staleRows.map((w) => prisma.exampleWord.delete({ where: { exampleId_lexemeId_position: { exampleId: w.exampleId, lexemeId: w.lexemeId, position: w.position } } })),
      ...rows.map((r) =>
        prisma.exampleWord.upsert({
          where: { exampleId_lexemeId_position: { exampleId: r.exampleId, lexemeId: r.lexemeId, position: r.position } },
          create: r,
          update: { senseId: r.senseId, surface: r.surface, isUsableForTiles: r.isUsableForTiles, prefixPosition: r.prefixPosition, prefixSurface: r.prefixSurface },
        }),
      ),
    ]);
    deleted += staleRows.length;

    console.log(`[index] batch ${Math.floor(i / batchSize) + 1}: ${Math.min(i + batchSize, examples.length)}/${examples.length} examples indexed so far`);
  }

  console.log('\n[index] ── report ─────────────────────────────────────────');
  console.log(`  examples indexed:         ${examples.length.toLocaleString()}`);
  console.log(`  ExampleWord created:      ${created.toLocaleString()}`);
  console.log(`  ExampleWord updated:      ${updated.toLocaleString()}`);
  console.log(`  ExampleWord unchanged:    ${unchanged.toLocaleString()}`);
  console.log(`  ExampleWord deleted (stale): ${deleted.toLocaleString()}`);
  console.log(`  usable for tiles:         ${usableForTiles.toLocaleString()}`);
  console.log(`  sense unresolved (ambiguous or none): ${unresolvedSense.toLocaleString()}`);
  console.log(`  skipped (no lexeme match, e.g. allowlisted proper noun): ${skippedNoLexeme.toLocaleString()}`);
  console.log('────────────────────────────────────────────────────────────');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
