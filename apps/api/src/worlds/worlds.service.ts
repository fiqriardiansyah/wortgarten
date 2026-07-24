import { Injectable, NotFoundException } from '@nestjs/common';
import { computeWorldProgress, displayForm, isKnownLevel } from '@wortgarten/shared';
import type { KnownWorldWord, MissingWorldWord, NewlyUnlockedWorld, WorldProgress } from '@wortgarten/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WordsService } from '../modules/words/words.service';

@Injectable()
export class WorldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly words: WordsService,
  ) {}

  private loadWorldsWithWords() {
    return this.prisma.world.findMany({
      orderBy: { requiredCount: 'asc' },
      include: { words: { include: { lexeme: { select: { lemma: true, partOfSpeech: true, gender: true } } } } },
    });
  }

  /** Known == level RECOGNIZE+, the exact definition story vocabulary selection gates new-word
   * eligibility on (packages/ai/src/story/select-vocabulary.ts) — imported, never redefined. */
  private async getKnownLexemeIds(userId: string, language: string): Promise<Set<string>> {
    const rows = await this.prisma.userWord.findMany({
      where: { userId, sense: { lexeme: { language } } },
      select: { level: true, sense: { select: { lexemeId: true } } },
    });
    return new Set(rows.filter((row) => isKnownLevel(row.level)).map((row) => row.sense.lexemeId));
  }

  private async getUnlockedKeys(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.userWorldUnlock.findMany({
      where: { userId },
      select: { world: { select: { key: true } } },
    });
    return new Set(rows.map((row) => row.world.key));
  }

  /** Pure read, never writes — a world reads as unlocked here as soon as its haveCount clears the
   * bar even before any UserWorldUnlock row exists (see computeWorldProgress's bootstrap fallback
   * in packages/shared/src/worlds.ts). Only recordUnlocks (below) ever persists that as a real event. */
  async getProgress(userId: string, language = 'de'): Promise<WorldProgress[]> {
    const [worlds, knownLexemeIds, bankLexemeIds, unlockedKeys] = await Promise.all([
      this.loadWorldsWithWords(),
      this.getKnownLexemeIds(userId, language),
      // Any level, including NEW — used below to find words that were added but haven't cleared
      // RECOGNIZE yet, never to decide isUnlocked (see the `+ Add` two-tone-progress fix).
      this.words.getKnownLexemeIds(userId),
      this.getUnlockedKeys(userId),
    ]);

    const haveCounts: Record<string, number> = {};
    const addedCounts: Record<string, number> = {};
    const knownWordsByKey: Record<string, KnownWorldWord[]> = {};
    for (const world of worlds) {
      const known = world.words.filter((w) => knownLexemeIds.has(w.lexemeId));
      haveCounts[world.key] = known.length;
      addedCounts[world.key] = world.words.filter((w) => bankLexemeIds.has(w.lexemeId) && !knownLexemeIds.has(w.lexemeId)).length;
      knownWordsByKey[world.key] = known
        .slice(0, 3)
        .map((w) => ({ lexemeId: w.lexemeId, displayLemma: displayForm(w.lexeme) }));
    }

    return computeWorldProgress(worlds, haveCounts, unlockedKeys, addedCounts, knownWordsByKey);
  }

  /**
   * The one place a world unlock is ever recorded — called from SessionService.complete(), the
   * sole place UserWord.level ever crosses into RECOGNIZE+. Returns only the worlds newly written
   * THIS call, so the session summary celebrates an unlock exactly once, never on a later read.
   */
  async recordUnlocks(userId: string, language = 'de'): Promise<NewlyUnlockedWorld[]> {
    const [progress, worlds, existingUnlocks] = await Promise.all([
      this.getProgress(userId, language),
      this.prisma.world.findMany({ select: { id: true, key: true } }),
      this.prisma.userWorldUnlock.findMany({ where: { userId }, select: { worldId: true } }),
    ]);
    const worldIdByKey = new Map(worlds.map((w) => [w.key, w.id]));
    const alreadyUnlockedWorldIds = new Set(existingUnlocks.map((u) => u.worldId));

    const newlyUnlocked: NewlyUnlockedWorld[] = [];
    for (const entry of progress) {
      // A requiredCount:0 world (the always-free "everyday" world) was never actually locked —
      // it's unconditionally unlocked by computeWorldProgress's own formula, with no threshold to
      // ever cross. Recording an event or celebrating an "unlock" for it would be hollow: nothing
      // was achieved. Skip it entirely, so it never gets a UserWorldUnlock row at all.
      if (!entry.isUnlocked || entry.requiredCount === 0) continue;
      const worldId = worldIdByKey.get(entry.key);
      if (!worldId || alreadyUnlockedWorldIds.has(worldId)) continue;
      try {
        await this.prisma.userWorldUnlock.create({ data: { userId, worldId } });
        newlyUnlocked.push({ key: entry.key, name: entry.name, icon: entry.icon });
      } catch {
        // Unique constraint race against a concurrent call — already recorded, not newly unlocked
        // from this call's perspective.
      }
    }
    return newlyUnlocked;
  }

  /** Words in this world the user hasn't added at all yet (any level) — the "tap a locked world"
   * surfacing, reusing the same "first sense" convention build-story-tokens.ts already uses for a
   * lexeme with no bank-chosen sense to fall back on. */
  async getMissingWords(userId: string, worldKey: string, language = 'de'): Promise<MissingWorldWord[]> {
    const world = await this.prisma.world.findUnique({
      where: { key: worldKey },
      include: { words: { include: { lexeme: { include: { senses: { take: 1 } } } } } },
    });
    if (!world) throw new NotFoundException('World not found');

    const bankLexemeIds = await this.words.getKnownLexemeIds(userId);

    return world.words
      .filter((w) => w.lexeme.language === language && !bankLexemeIds.has(w.lexemeId))
      .flatMap((w) => {
        const sense = w.lexeme.senses[0];
        if (!sense) return [];
        return [
          {
            lexemeId: w.lexemeId,
            senseId: sense.id,
            displayLemma: displayForm({ lemma: w.lexeme.lemma, partOfSpeech: w.lexeme.partOfSpeech, gender: w.lexeme.gender }),
          },
        ];
      });
  }
}
