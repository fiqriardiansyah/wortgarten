import { z } from 'zod';

export const KnownWorldWordSchema = z.object({
  lexemeId: z.string(),
  displayLemma: z.string(),
});
export type KnownWorldWord = z.infer<typeof KnownWorldWordSchema>;

export const WorldProgressSchema = z.object({
  key: z.string(),
  name: z.string(),
  icon: z.string(),
  // The exact phrase spliced into the story prompt (see WorldDef below) — reused verbatim as the
  // "Stories set {hint}." description line so the worlds card never needs a second copy field.
  hint: z.string(),
  requiredCount: z.number(),
  haveCount: z.number(),
  // Words already added to the bank for this world but still below RECOGNIZE — the "waiting in
  // your next session" gap. Never counted toward `haveCount`/`isUnlocked` (see computeWorldProgress).
  addedCount: z.number(),
  // A short sample of the user's own known (RECOGNIZE+) words in this world, for mirror-voice
  // copy ("You know: der Kaffee") — never the full list, never every word.
  knownWords: z.array(KnownWorldWordSchema),
  isUnlocked: z.boolean(),
});
export type WorldProgress = z.infer<typeof WorldProgressSchema>;

export const WorldsResponseSchema = z.object({
  worlds: z.array(WorldProgressSchema),
});
export type WorldsResponse = z.infer<typeof WorldsResponseSchema>;

export const MissingWorldWordSchema = z.object({
  lexemeId: z.string(),
  senseId: z.string(),
  displayLemma: z.string(),
});
export type MissingWorldWord = z.infer<typeof MissingWorldWordSchema>;

export const MissingWorldWordsResponseSchema = z.object({
  words: z.array(MissingWorldWordSchema),
});
export type MissingWorldWordsResponse = z.infer<typeof MissingWorldWordsResponseSchema>;

export interface WorldDef {
  key: string;
  name: string;
  icon: string;
  hint: string;
  requiredCount: number;
}

/**
 * Pure math, no IO. A world is unlocked if it's the always-free 0-required world, if the caller
 * already found a recorded UserWorldUnlock row for it, or — a bootstrap/self-heal fallback for a
 * user who already had enough qualifying known words before that row ever existed — haveCount
 * alone already clears the bar. Once any of those three holds it holds forever from the caller's
 * point of view: this function never needs to flip true back to false, since the caller only ever
 * widens `unlockedKeys` over time (see packages/database's world-progress query in apps/api and
 * packages/ai), never narrows it.
 *
 * `addedCounts` and `knownWordsByKey` are optional, IO-derived inputs the caller (WorldsService)
 * merges in from the bank — never counted toward `isUnlocked`, purely display data for the "waiting
 * in your next session" / "You know: …" mirror-voice copy. Missing entries default to empty.
 */
export function computeWorldProgress(
  worlds: WorldDef[],
  haveCounts: Record<string, number>,
  unlockedKeys: Set<string>,
  addedCounts: Record<string, number> = {},
  knownWordsByKey: Record<string, KnownWorldWord[]> = {},
): WorldProgress[] {
  return worlds.map((world) => {
    const haveCount = haveCounts[world.key] ?? 0;
    const isUnlocked = world.requiredCount === 0 || unlockedKeys.has(world.key) || haveCount >= world.requiredCount;
    return {
      key: world.key,
      name: world.name,
      icon: world.icon,
      hint: world.hint,
      requiredCount: world.requiredCount,
      haveCount,
      addedCount: addedCounts[world.key] ?? 0,
      knownWords: knownWordsByKey[world.key] ?? [],
      isUnlocked,
    };
  });
}
