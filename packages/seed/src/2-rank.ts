import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { parseArgs } from 'util';
import { KaikkiEntrySchema, type RankedFile } from './types';
import {
  mapPos,
  extractGender,
  extractPlural,
  extractSeparablePrefix,
  extractAuxiliary,
  extractPastParticiple,
  lexemeCoreKey,
  isFormOfEntry,
  scoreEntry,
  type LexemeIdentity,
} from './map';
import { loadFrequencyList } from './frequency';
import { buildLemmaSet } from './lemma-set';

const DATA_DIR = path.join(__dirname, '..', 'data');
const DEFAULT_IN = path.join(DATA_DIR, 'german.jsonl');
const DEFAULT_OUT = path.join(DATA_DIR, 'ranked.json');

interface Candidate extends LexemeIdentity {
  etymologyNumbers: Set<number>;
  score: number;
}

async function main() {
  const { values } = parseArgs({
    allowPositionals: true, // pnpm on Windows can forward a stray literal "--" token
    options: {
      in: { type: 'string', default: DEFAULT_IN },
      out: { type: 'string', default: DEFAULT_OUT },
      freq: { type: 'string' },
      limit: { type: 'string', default: '5000' },
      force: { type: 'boolean', default: false },
    },
  });

  const inPath = values.in as string;
  const outPath = values.out as string;
  const limit = Number(values.limit);
  const force = values.force as boolean;

  if (!values.freq) {
    console.error('[rank] --freq <path> is required (a word<TAB|space>count frequency list)');
    process.exitCode = 1;
    return;
  }
  if (!force && fs.existsSync(outPath)) {
    console.log(`[rank] ${outPath} already exists — skipping (pass --force to redo)`);
    return;
  }
  if (!fs.existsSync(inPath)) {
    console.error(`[rank] input not found: ${inPath} — run seed:filter first`);
    process.exitCode = 1;
    return;
  }

  const freq = await loadFrequencyList(values.freq as string);
  const lemmaSet = await buildLemmaSet(inPath);
  console.log(`[rank] lemma set: ${lemmaSet.size.toLocaleString()} distinct words in the dump`);
  const candidates = new Map<string, Candidate>();

  let read = 0;
  let malformed = 0;
  let formOfSkipped = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(inPath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    read++;

    const result = KaikkiEntrySchema.safeParse(JSON.parse(line));
    if (!result.success) {
      malformed++;
      continue;
    }
    const entry = result.data;

    // form_of entries aren't lemmas — they're harvested as extra WordForm
    // rows against their target lemma in Pass 3, not scored here.
    if (isFormOfEntry(entry, lemmaSet)) {
      formOfSkipped++;
      continue;
    }

    const pos = mapPos(entry.pos);
    const gender = extractGender(entry, pos) ?? null;
    const plural = extractPlural(entry, pos) ?? null;
    const separablePrefix = extractSeparablePrefix(entry, pos) ?? null;
    const auxiliary = extractAuxiliary(entry, pos) ?? null;
    const pastParticiple = extractPastParticiple(entry, pos) ?? null;
    const identity: LexemeIdentity = { lemma: entry.word, pos, gender, plural, separablePrefix, auxiliary, pastParticiple };
    const key = lexemeCoreKey(identity);
    const score = scoreEntry(entry, freq, separablePrefix ?? undefined);

    const existing = candidates.get(key);
    if (existing) {
      existing.score += score;
      if (entry.etymology_number !== undefined) existing.etymologyNumbers.add(entry.etymology_number);
    } else {
      candidates.set(key, {
        ...identity,
        etymologyNumbers: entry.etymology_number !== undefined ? new Set([entry.etymology_number]) : new Set(),
        score,
      });
    }
  }

  const ranked = [...candidates.values()]
    .filter((c) => c.score > 0) // a word nobody says is not worth seeding
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((c, i) => ({
      lemma: c.lemma,
      pos: c.pos,
      gender: c.gender ?? null,
      plural: c.plural ?? null,
      separablePrefix: c.separablePrefix ?? null,
      auxiliary: c.auxiliary ?? null,
      pastParticiple: c.pastParticiple ?? null,
      // Null when this candidate merged raw entries from more than one
      // etymology (the merge guard: same core key, differing etymology) —
      // there's no single honest answer once that's happened.
      etymologyNumber: c.etymologyNumbers.size === 1 ? [...c.etymologyNumbers][0] : null,
      score: c.score,
      rank: i + 1,
    }));

  const file: RankedFile = { generatedAt: new Date().toISOString(), limit, entries: ranked };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(file, null, 2));

  console.log('[rank] done.');
  console.log(`  entries read:       ${read.toLocaleString()}`);
  console.log(`  form_of skipped:    ${formOfSkipped.toLocaleString()}`);
  console.log(`  malformed skipped:  ${malformed.toLocaleString()}`);
  console.log(`  lemma candidates:   ${candidates.size.toLocaleString()}`);
  console.log(`  selected top-N:     ${ranked.length.toLocaleString()}`);
  console.log('  top 50 (sanity-check these look like real high-frequency German):');
  for (const r of ranked.slice(0, 50)) {
    console.log(`    ${r.rank}. ${r.lemma} (${r.pos}${r.gender ? ', ' + r.gender : ''}) — ${r.score}`);
  }
  console.log(`  output: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
