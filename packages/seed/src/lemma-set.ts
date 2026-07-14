import fs from 'fs';
import readline from 'readline';

/**
 * Every `entry.word` in the filtered kaikki stream (`german.jsonl` — already pos/archaic-filtered
 * by Pass 1), used only to answer "is this word actually in the dump" for `isFormOfEntry`'s
 * real-target guard (see map.ts). A raw `word` read, not a full `KaikkiEntrySchema.parse` — this
 * runs as an extra full-file pass before the real streaming work in Pass 2/3, so it stays cheap.
 */
export async function buildLemmaSet(inPath: string): Promise<Set<string>> {
  const set = new Set<string>();
  const rl = readline.createInterface({ input: fs.createReadStream(inPath, { encoding: 'utf-8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      continue;
    }
    const word = (raw as { word?: unknown }).word;
    if (typeof word === 'string') set.add(word);
  }
  return set;
}
