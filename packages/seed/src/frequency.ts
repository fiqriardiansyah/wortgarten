import fs from 'fs';
import readline from 'readline';
import { foldForLookup } from '@wortgarten/shared';

/**
 * Loads a two-column `word<TAB|space>count` frequency list into a
 * Map<foldForLookup(word), summedCount>. Source-agnostic on purpose — the
 * caller passes a path, we don't care where the list came from (document the
 * chosen source + license in README.md, not here).
 */
export async function loadFrequencyList(path: string): Promise<Map<string, number>> {
  const freq = new Map<string, number>();
  const rl = readline.createInterface({
    input: fs.createReadStream(path, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  let total = 0;
  let skipped = 0;

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(/[\t ]+/);
    if (parts.length < 2) {
      skipped++;
      continue;
    }

    const [word, countStr] = parts;
    const count = Number(countStr);
    if (!word || !Number.isFinite(count)) {
      skipped++;
      continue;
    }

    const key = foldForLookup(word);
    freq.set(key, (freq.get(key) ?? 0) + count);
    total++;
  }

  console.log(`[frequency] loaded ${total} entries from ${path} (${skipped} lines skipped)`);
  return freq;
}
