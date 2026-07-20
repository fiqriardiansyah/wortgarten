import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '@wortgarten/database';
import { deleteObject, listKeysWithPrefix } from './r2.client';

// Loads R2_* / DATABASE_URL etc. from the repo-root .env — this script runs outside Nest's
// ConfigModule, same approach as packages/seed/src/env.ts.
const envPath = resolve(__dirname, '../../../.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const STORIES_PREFIX = 'stories/';

/** Lists every R2 object under `stories/` with no matching `Story.coverImageKey` and reports them
 * — covers can be orphaned if a story row is ever deleted directly (no app code does this today).
 * Pass `--delete` to actually remove the orphans from R2; without it, this only reports. */
async function main() {
  const shouldDelete = process.argv.includes('--delete');
  const prisma = new PrismaClient();

  try {
    const [allKeys, rows] = await Promise.all([
      listKeysWithPrefix(STORIES_PREFIX),
      prisma.story.findMany({ where: { coverImageKey: { not: null } }, select: { coverImageKey: true } }),
    ]);

    const referencedKeys = new Set(rows.map((r) => r.coverImageKey).filter((k): k is string => k !== null));
    const orphans = allKeys.filter((key) => !referencedKeys.has(key));

    if (orphans.length === 0) {
      console.log('[orphan-scan] no orphaned covers found');
      return;
    }

    console.log(`[orphan-scan] found ${orphans.length} orphaned cover(s):`);
    for (const key of orphans) console.log(`  ${key}`);

    if (shouldDelete) {
      for (const key of orphans) {
        await deleteObject(key);
        console.log(`[orphan-scan] deleted ${key}`);
      }
    } else {
      console.log('[orphan-scan] re-run with --delete to remove these');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[orphan-scan] crashed:', err);
  process.exit(1);
});
