import './env';
import fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';
import { z } from 'zod';
import { PrismaClient, type Gender } from '@wortgarten/database';
import { ARTICLE_BY_GENDER } from '@wortgarten/shared';
import { contentId } from './map';
import { loadLexiconIndex, resolveSurface, type LexiconIndex } from './lexicon-index';

const DATA_DIR = path.join(__dirname, '..', 'data', 'worlds');

const WorldFileSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  icon: z.string().min(1),
  requiredCount: z.number().int().nonnegative(),
  hint: z.string().min(1),
  image: z.string().url().optional(),
  words: z.array(z.string().min(1)).min(1),
});
type WorldFile = z.infer<typeof WorldFileSchema>;

const GENDER_BY_ARTICLE: Record<string, Gender> = Object.fromEntries(
  Object.entries(ARTICLE_BY_GENDER).map(([gender, article]) => [article, gender as Gender]),
);

/**
 * "das Haus" -> the noun disambiguated by gender (fixes exactly the recurring homograph bug: a
 * bare "Bank" string would let 🌳 Park unlock from 🏦 banking vocab). "essen" -> a plain lookup.
 * Anything else (3+ tokens, or a 2-token phrase not led by der/die/das) is unresolved on purpose —
 * world word lists are meant to stay this simple; see packages/seed/data/worlds/README.md. A
 * gender-led lookup that finds no candidate with a matching gender is ALSO unresolved rather than
 * falling back to a generic best guess — silently picking the wrong homograph is worse than
 * dropping the word loudly and routing it to the review queue.
 */
function resolveWorldWord(index: LexiconIndex, text: string): string | null {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    return resolveSurface(index, tokens[0], false)[0]?.lexeme.id ?? null;
  }
  if (tokens.length === 2) {
    const gender = GENDER_BY_ARTICLE[tokens[0].toLowerCase()];
    if (!gender) return null;
    const candidates = resolveSurface(index, tokens[1], false);
    return candidates.find((c) => c.lexeme.gender === gender)?.lexeme.id ?? null;
  }
  return null;
}

interface WorldLoadResult {
  world: WorldFile;
  resolvedLexemeIds: Set<string>;
  unresolved: string[];
}

function loadWorldFile(index: LexiconIndex, filePath: string): WorldLoadResult {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const world = WorldFileSchema.parse(raw);

  const resolvedLexemeIds = new Set<string>();
  const unresolved: string[] = [];
  for (const word of world.words) {
    const lexemeId = resolveWorldWord(index, word);
    if (lexemeId) resolvedLexemeIds.add(lexemeId);
    else unresolved.push(word);
  }
  return { world, resolvedLexemeIds, unresolved };
}

async function upsertWorld(prisma: PrismaClient, result: WorldLoadResult): Promise<{ created: number; deleted: number; unchanged: number }> {
  const { world, resolvedLexemeIds } = result;
  const worldId = contentId(`world:${world.key}`);

  await prisma.world.upsert({
    where: { key: world.key },
    create: { id: worldId, key: world.key, name: world.name, icon: world.icon, hint: world.hint, requiredCount: world.requiredCount, image: world.image ?? null },
    update: { name: world.name, icon: world.icon, hint: world.hint, requiredCount: world.requiredCount, image: world.image ?? null },
  });

  const existing = await prisma.worldWord.findMany({ where: { worldId }, select: { id: true, lexemeId: true } });
  const existingLexemeIds = new Set(existing.map((w) => w.lexemeId));
  const toCreate = [...resolvedLexemeIds].filter((id) => !existingLexemeIds.has(id));
  // A lexemeId that existed before but isn't in this run's resolved set (word list changed, or a
  // word stopped resolving) is pure liability — delete it, same reasoning as every other seed
  // stage's stale-row cleanup (see 5-index.ts).
  const toDelete = existing.filter((w) => !resolvedLexemeIds.has(w.lexemeId));

  await prisma.$transaction([
    ...toDelete.map((w) => prisma.worldWord.delete({ where: { id: w.id } })),
    ...toCreate.map((lexemeId) => prisma.worldWord.create({ data: { worldId, lexemeId } })),
  ]);

  return { created: toCreate.length, deleted: toDelete.length, unchanged: existingLexemeIds.size - toDelete.length };
}

async function recordUnresolvedSurfaces(prisma: PrismaClient, language: string, occurrencesBySurface: Map<string, number>): Promise<void> {
  for (const [surface, occurrences] of occurrencesBySurface) {
    await prisma.unresolvedStoryWord
      .upsert({
        where: { language_surface: { language, surface } },
        create: { language, surface, occurrences },
        update: { occurrences: { increment: occurrences }, lastSeenAt: new Date() },
      })
      .catch((err) => console.error(`[worlds] failed to record unresolved surface "${surface}":`, err));
  }
}

async function main() {
  const { values } = parseArgs({
    allowPositionals: true, // pnpm on Windows can forward a stray literal "--" token
    options: {
      language: { type: 'string', default: 'de' },
      dir: { type: 'string', default: DATA_DIR },
    },
  });
  const language = values.language as string;
  const dir = values.dir as string;

  const prisma = new PrismaClient();
  const index = await loadLexiconIndex(prisma, language);
  console.log(`[worlds] loaded lexicon index: ${index.lexemesById.size.toLocaleString()} lexemes`);

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  if (files.length === 0) {
    console.error(`[worlds] no world JSON files found in ${dir}`);
    process.exit(1);
  }

  const unresolvedOccurrences = new Map<string, number>();
  let anyBelowThreshold = false;

  console.log('\n[worlds] ── report ─────────────────────────────────────────');
  for (const file of files) {
    const result = loadWorldFile(index, path.join(dir, file));
    const { world, resolvedLexemeIds, unresolved } = result;

    for (const surface of unresolved) {
      console.warn(`[worlds] "${world.key}": unresolved word "${surface}"`);
      unresolvedOccurrences.set(surface, (unresolvedOccurrences.get(surface) ?? 0) + 1);
    }

    const required = world.requiredCount * 3;
    const passed = resolvedLexemeIds.size >= required;
    if (!passed) anyBelowThreshold = true;
    console.log(
      `  ${world.key}: resolved ${resolvedLexemeIds.size}/${world.words.length} (need >= ${required} = requiredCount*3) — ${passed ? 'OK' : 'FAIL'}`,
    );

    const { created, deleted, unchanged } = await upsertWorld(prisma, result);
    console.log(`  ${world.key}: WorldWord created=${created} deleted(stale)=${deleted} unchanged=${unchanged}`);
  }
  console.log('────────────────────────────────────────────────────────────');

  await recordUnresolvedSurfaces(prisma, language, unresolvedOccurrences);
  await prisma.$disconnect();

  if (anyBelowThreshold) {
    console.error(
      '\n[worlds] FAILED: at least one world has fewer resolved words than requiredCount * 3. ' +
        'Widen its word list or fix the dictionary before shipping — see packages/seed/data/worlds/README.md.',
    );
    process.exit(1);
  }
  console.log('\n[worlds] all worlds passed the requiredCount*3 threshold.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
