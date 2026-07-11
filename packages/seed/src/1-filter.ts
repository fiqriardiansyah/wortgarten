import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';
import { parseArgs } from 'util';
import { KaikkiEntrySchema } from './types';
import { isRejectedPos, isArchaic } from './map';

const DATA_DIR = path.join(__dirname, '..', 'data');
const DEFAULT_IN = path.join(DATA_DIR, 'raw-wiktextract-data.jsonl.gz');
const DEFAULT_OUT = path.join(DATA_DIR, 'german.jsonl');

async function main() {
  const { values } = parseArgs({
    allowPositionals: true, // pnpm on Windows can forward a stray literal "--" token
    options: {
      in: { type: 'string', default: DEFAULT_IN },
      out: { type: 'string', default: DEFAULT_OUT },
      force: { type: 'boolean', default: false },
    },
  });

  const inPath = values.in as string;
  const outPath = values.out as string;
  const force = values.force as boolean;

  if (!force && fs.existsSync(outPath)) {
    console.log(`[filter] ${outPath} already exists — skipping (pass --force to redo)`);
    return;
  }
  if (!fs.existsSync(inPath)) {
    console.error(`[filter] input not found: ${inPath}`);
    console.error('See packages/seed/README.md for download instructions.');
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const rawStream = fs.createReadStream(inPath);
  const input = inPath.endsWith('.gz') ? rawStream.pipe(zlib.createGunzip()) : rawStream;
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  const out = fs.createWriteStream(outPath, { flags: 'w' });

  let read = 0;
  let kept = 0;
  let malformed = 0;
  let rejectedLang = 0;
  let rejectedPos = 0;
  let rejectedArchaic = 0;
  const start = Date.now();

  for await (const line of rl) {
    read++;
    if (!line.trim()) continue;

    // Cheap pre-check before the zod pass: ~98% of lines are non-German and
    // die here on a plain property read, never touching schema validation.
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      malformed++;
      continue;
    }
    if (typeof raw !== 'object' || raw === null || (raw as { lang_code?: string }).lang_code !== 'de') {
      rejectedLang++;
      continue;
    }

    const result = KaikkiEntrySchema.safeParse(raw);
    if (!result.success) {
      malformed++;
      continue;
    }
    const entry = result.data;

    if (isRejectedPos(entry.pos)) {
      rejectedPos++;
      continue;
    }
    if (isArchaic(entry)) {
      rejectedArchaic++;
      continue;
    }

    kept++;
    const canWrite = out.write(JSON.stringify(entry) + '\n');
    if (!canWrite) {
      await new Promise<void>((resolve) => out.once('drain', () => resolve()));
    }

    if (read % 1_000_000 === 0) {
      const elapsedSec = ((Date.now() - start) / 1000).toFixed(0);
      console.log(`[filter] ${read.toLocaleString()} lines read, ${kept.toLocaleString()} kept, ${elapsedSec}s elapsed`);
    }
  }

  await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));

  const elapsedSec = ((Date.now() - start) / 1000).toFixed(0);
  console.log('[filter] done.');
  console.log(`  lines read:         ${read.toLocaleString()}`);
  console.log(`  kept (de):          ${kept.toLocaleString()}`);
  console.log(`  rejected (lang):    ${rejectedLang.toLocaleString()}`);
  console.log(`  rejected (pos):     ${rejectedPos.toLocaleString()}`);
  console.log(`  rejected (archaic): ${rejectedArchaic.toLocaleString()}`);
  console.log(`  malformed skipped:  ${malformed.toLocaleString()}`);
  console.log(`  elapsed:            ${elapsedSec}s`);
  console.log(`  output:             ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
