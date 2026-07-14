import './env';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { parseArgs } from 'util';
import { PrismaClient, type ExampleSource } from '@wortgarten/database';
import { normalizeInput, tokenize } from '@wortgarten/shared';
import { contentId } from './map';
import { loadLexiconIndex, resolveSurface, type LexiconIndex } from './lexicon-index';
import { isAllowlistedProperNoun } from './proper-noun-allowlist';

const DATA_DIR = path.join(__dirname, '..', 'data');
const DEFAULT_TATOEBA_IN = path.join(DATA_DIR, 'deu-eng.tsv');

interface ExampleRow {
  id: string;
  text: string;
  translation: string;
  normalized: string;
  tokenCount: number;
  source: ExampleSource;
  sourceRef: string | null;
  isWellFormed: boolean;
}

/** Whitespace-collapsed, NFC-normalized dedupe key — the same German sentence must land on the
 * same row whichever source it arrives from (see Example.normalized's @unique constraint). */
function normalizeExampleText(text: string): string {
  return normalizeInput(text).replace(/\s+/g, ' ').trim();
}

const SENTENCE_END = /[.!?]$/;
const PLACEHOLDER_TRANSLATION = /please add .* translation/i;

function hasRealTranslation(translation: string | undefined | null): translation is string {
  if (!translation) return false;
  const t = translation.trim();
  if (t.length === 0) return false;
  // Wiktionary's own "no translation yet" placeholder gloss (verified in real data on quotation
  // examples) — present as text, but not a usable prompt.
  if (PLACEHOLDER_TRANSLATION.test(t)) return false;
  return true;
}

interface Evaluation {
  tokenCount: number;
  isWellFormed: boolean;
}

/**
 * Part 4's well-formedness filter, all five rules. `freqTally` is mutated with every token that
 * resolves to no seeded lexeme — the raw material for the top-50 proper-noun report (Part 3),
 * tallied over the whole corpus regardless of whether the sentence passes the other rules.
 */
function evaluateSentence(text: string, translation: string | undefined, index: LexiconIndex, freqTally: Map<string, number>): Evaluation {
  const trimmed = text.trim();
  const tokens = tokenize(trimmed);

  let unresolvedCount = 0;
  let allUnresolvedAllowlisted = true;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const matches = resolveSurface(index, token, i === 0);
    if (matches.length > 0) continue;
    unresolvedCount++;
    freqTally.set(token, (freqTally.get(token) ?? 0) + 1);
    if (!isAllowlistedProperNoun(token)) allUnresolvedAllowlisted = false;
  }

  const lengthOk = tokens.length >= 4 && tokens.length <= 10;
  const startsCapital = /^\p{Lu}/u.test(trimmed);
  const endsSentence = SENTENCE_END.test(trimmed);
  const translationOk = hasRealTranslation(translation);
  const vocabOk = unresolvedCount <= 2 && allUnresolvedAllowlisted;

  return { tokenCount: tokens.length, isWellFormed: lengthOk && startsCapital && endsSentence && translationOk && vocabOk };
}

function exampleChanged(
  existing: { text: string; translation: string; normalized: string; tokenCount: number; source: string; sourceRef: string | null; isWellFormed: boolean },
  next: { text: string; translation: string; normalized: string; tokenCount: number; source: string; sourceRef: string | null; isWellFormed: boolean },
): boolean {
  return (
    existing.text !== next.text ||
    existing.translation !== next.translation ||
    existing.normalized !== next.normalized ||
    existing.tokenCount !== next.tokenCount ||
    existing.source !== next.source ||
    existing.sourceRef !== next.sourceRef ||
    existing.isWellFormed !== next.isWellFormed
  );
}

async function upsertExamples(prisma: PrismaClient, rows: ExampleRow[], batchSize: number) {
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const ids = chunk.map((r) => r.id);
    const existing = await prisma.example.findMany({ where: { id: { in: ids } } });
    const existingById = new Map(existing.map((e) => [e.id, e]));

    for (const r of chunk) {
      const ex = existingById.get(r.id);
      if (!ex) created++;
      else if (exampleChanged(ex, r)) updated++;
      else unchanged++;
    }

    await prisma.$transaction(
      chunk.map((r) =>
        prisma.example.upsert({
          where: { id: r.id },
          create: { id: r.id, text: r.text, translation: r.translation, normalized: r.normalized, tokenCount: r.tokenCount, source: r.source, sourceRef: r.sourceRef, isWellFormed: r.isWellFormed },
          update: { text: r.text, translation: r.translation, normalized: r.normalized, tokenCount: r.tokenCount, source: r.source, sourceRef: r.sourceRef, isWellFormed: r.isWellFormed },
        }),
      ),
    );

    console.log(`[examples] batch ${Math.floor(i / batchSize) + 1}: ${Math.min(i + batchSize, rows.length)}/${rows.length} examples upserted so far`);
  }

  console.log(`[examples] created: ${created.toLocaleString()}, updated: ${updated.toLocaleString()}, unchanged: ${unchanged.toLocaleString()}`);
}

/**
 * Tatoeba's German–English sentence-pairs TSV: `deu_id, deu_text, eng_id, eng_text`. The same
 * German sentence recurs under many `eng_id`s (alternate/looser translations) — group by
 * `deu_id` and keep only the lowest `eng_id`, the original direct translation (Part 3).
 */
async function loadTatoebaPairs(inPath: string): Promise<Map<number, { deuText: string; engId: number; engText: string }>> {
  const bySentenceId = new Map<number, { deuText: string; engId: number; engText: string }>();
  let linesRead = 0;
  let malformed = 0;

  const rl = readline.createInterface({ input: fs.createReadStream(inPath, { encoding: 'utf-8' }), crlfDelay: Infinity });
  let first = true;
  for await (let line of rl) {
    if (first) {
      line = line.replace(/^﻿/, ''); // Tatoeba's export ships a UTF-8 BOM on the first line
      first = false;
    }
    if (!line.trim()) continue;
    linesRead++;

    const parts = line.split('\t');
    if (parts.length !== 4) {
      malformed++;
      continue;
    }
    const [deuIdStr, deuText, engIdStr, engText] = parts;
    const deuId = Number(deuIdStr);
    const engId = Number(engIdStr);
    if (!Number.isFinite(deuId) || !Number.isFinite(engId) || !deuText.trim() || !engText.trim()) {
      malformed++;
      continue;
    }

    const existing = bySentenceId.get(deuId);
    if (!existing || engId < existing.engId) {
      bySentenceId.set(deuId, { deuText, engId, engText });
    }
  }

  console.log(`[examples] tatoeba: ${linesRead.toLocaleString()} lines read, ${malformed.toLocaleString()} malformed skipped, ${bySentenceId.size.toLocaleString()} distinct German sentences (by deu_id)`);
  return bySentenceId;
}

async function ingestTatoeba(prisma: PrismaClient, index: LexiconIndex, inPath: string, batchSize: number) {
  if (!fs.existsSync(inPath)) {
    console.error(`[examples] input not found: ${inPath}`);
    process.exitCode = 1;
    return;
  }

  const bySentenceId = await loadTatoebaPairs(inPath);

  const freqTally = new Map<string, number>();
  const rows = new Map<string, ExampleRow>(); // keyed by content-hash id — collapses a normalized collision across different deu_id, not just the per-deu_id dedupe above
  let normalizedCollisions = 0;

  for (const [deuId, pair] of bySentenceId) {
    const normalized = normalizeExampleText(pair.deuText);
    const { tokenCount, isWellFormed } = evaluateSentence(pair.deuText, pair.engText, index, freqTally);
    const id = contentId(normalized);
    if (rows.has(id)) normalizedCollisions++;
    rows.set(id, {
      id,
      text: pair.deuText.trim(),
      translation: pair.engText.trim(),
      normalized,
      tokenCount,
      source: 'TATOEBA',
      sourceRef: `tatoeba:${deuId}/${pair.engId}`,
      isWellFormed,
    });
  }

  console.log(`[examples] tatoeba: ${rows.size.toLocaleString()} unique normalized sentences (${normalizedCollisions.toLocaleString()} normalized collisions across different deu_id, last-write-wins)`);

  const rowList = [...rows.values()];
  await upsertExamples(prisma, rowList, batchSize);

  const wellFormedCount = rowList.filter((r) => r.isWellFormed).length;
  console.log(`[examples] tatoeba: ${wellFormedCount.toLocaleString()}/${rowList.length.toLocaleString()} well-formed (${((wellFormedCount / rowList.length) * 100).toFixed(1)}%)`);

  const topUnresolved = [...freqTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50);
  console.log('\n[examples] top 50 tokens that resolve to no seeded lexeme (candidates for src/proper-noun-allowlist.ts):');
  for (const [token, count] of topUnresolved) console.log(`    ${count.toString().padStart(6)}  ${token}`);
}

async function main() {
  const { values } = parseArgs({
    allowPositionals: true, // pnpm on Windows can forward a stray literal "--" token
    options: {
      source: { type: 'string' },
      in: { type: 'string' },
      language: { type: 'string', default: 'de' },
      'batch-size': { type: 'string', default: '2000' },
    },
  });

  const source = values.source as string | undefined;
  const language = values.language as string;
  const batchSize = Number(values['batch-size']);

  if (source !== 'tatoeba' && source !== 'wiktionary') {
    console.error('[examples] --source <tatoeba|wiktionary> is required');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  const index = await loadLexiconIndex(prisma, language);
  console.log(`[examples] loaded lexicon index: ${index.lexemesById.size.toLocaleString()} lexemes, ${index.lexemeIdsByNormalized.size.toLocaleString()} distinct normalized forms`);

  if (source === 'tatoeba') {
    const inPath = (values.in as string) ?? DEFAULT_TATOEBA_IN;
    await ingestTatoeba(prisma, index, inPath, batchSize);
  } else {
    console.error('[examples] --source wiktionary is not implemented yet — see the sentence-corpus spec\'s Build order step 6/7 (gated on the Tatoeba coverage report).');
    process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
