import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AudioService } from '@wortgarten/audio';
import { PrismaClient } from '@wortgarten/database';
import { ImageService } from '@wortgarten/images';
import { foldForLookup } from '@wortgarten/shared';
import type { AiProvider } from '@wortgarten/shared';
import { AiService } from '../ai.service';
import type { AiRouterPort } from '../ai-router';
import { FakeAdapter } from '../adapters/fake.adapter';
import { generateStoryForUser } from './generate-story';
import { LexemeResolver } from './lexeme-resolver';
import { checkStoryDraft } from './story-checker';
import { MIN_KNOWN_WORDS_FOR_STORY } from './select-vocabulary';

const LANG = 'de-story-generate-fixture';

const prisma = new PrismaClient();
const imageService = new ImageService(); // STORY_IMAGES_ENABLED is unset in tests — attachStoryCover no-ops
const audioService = new AudioService(); // STORY_AUDIO_ENABLED is unset in tests — attachStoryAudio no-ops
const lexemeIds: string[] = [];
const storyIds: string[] = [];
let userId: string;

class FakeRouter implements AiRouterPort {
  constructor(private readonly provider: AiProvider) {}
  async decide(): Promise<AiProvider> {
    return this.provider;
  }
  async recordGroqSuccess(): Promise<void> {}
}

async function createLexemeWithSense(lemma: string, opts: { partOfSpeech?: 'NOUN' | 'ADJECTIVE'; gender?: 'MASCULINE'; frequencyRank?: number; form?: string } = {}) {
  const lexeme = await prisma.lexeme.create({
    data: {
      id: randomUUID(),
      sourceKey: randomUUID(),
      language: LANG,
      lemma,
      partOfSpeech: opts.partOfSpeech ?? 'NOUN',
      gender: opts.gender,
      frequencyRank: opts.frequencyRank,
      senses: { create: [{ id: randomUUID(), sourceKey: randomUUID(), translation: `${lemma}-translation` }] },
      forms: opts.form ? { create: [{ surface: opts.form, normalized: foldForLookup(opts.form) }] } : undefined,
    },
    include: { senses: true },
  });
  lexemeIds.push(lexeme.id);
  return lexeme;
}

beforeAll(async () => {
  const user = await prisma.user.create({ data: { name: 'Story Generate Test', email: `story-generate-test-${Date.now()}@example.com` } });
  userId = user.id;

  // Filler known words — no WordForm needed, they never appear in the draft, they just need to
  // clear MIN_KNOWN_WORDS_FOR_STORY so selectStoryVocabulary doesn't bail out.
  for (let i = 0; i < MIN_KNOWN_WORDS_FOR_STORY; i++) {
    const lexeme = await createLexemeWithSense(`filler-${i}`);
    await prisma.userWord.create({ data: { userId, senseId: lexeme.senses[0].id, level: 'RECOGNIZE', dueAt: new Date() } });
  }

  // A known word that DOES appear in the draft.
  const hund = await createLexemeWithSense('Hund', { gender: 'MASCULINE', form: 'Hund' });
  await prisma.userWord.create({ data: { userId, senseId: hund.senses[0].id, level: 'RECOGNIZE', dueAt: new Date() } });

  // A new-word candidate (rank > FUNCTION_WORD_RANK_CEILING, not in the bank).
  await createLexemeWithSense('neugierig', { partOfSpeech: 'ADJECTIVE', frequencyRank: 300, form: 'Neugierig' });
});

afterAll(async () => {
  await prisma.unresolvedStoryWord.deleteMany({ where: { language: LANG } });
  if (storyIds.length > 0) await prisma.story.deleteMany({ where: { id: { in: storyIds } } });
  await prisma.userWord.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.lexeme.deleteMany({ where: { id: { in: lexemeIds } } });
  await prisma.$disconnect();
});

describe('generateStoryForUser', () => {
  it('runs vocab selection → AI spine → checker → builder → persist end to end', async () => {
    const resolver = new LexemeResolver(prisma);

    const draftJson = { title: 'Hund', story: 'Hund.\n\nNeugierig.', translation: 'Dog.\n\nCurious.' };
    const router = new FakeRouter('GROQ');
    const groq = new FakeAdapter('GROQ', [draftJson]);
    const ollama = new FakeAdapter('OLLAMA', [draftJson]);
    const aiService = new AiService(router, groq, ollama, 0, checkStoryDraft);

    const result = await generateStoryForUser(prisma, aiService, resolver, imageService, audioService, userId, 'batch', LANG);

    expect(result.status).toBe('shipped');
    if (result.status !== 'shipped') return;
    storyIds.push(result.storyId);

    const row = await prisma.story.findUnique({ where: { id: result.storyId } });
    expect(row).not.toBeNull();
    if (!row) return;

    expect(row.title).toBe('Hund');
    expect(row.translation).toBe('Dog.\n\nCurious.');
    expect(row.source).toBe('GROQ');
    expect(row.estMinutes).toBeGreaterThanOrEqual(1);
    expect(row.coverageKnownPct).toBe(100);
    expect(row.readAt).toBeNull();

    const paragraphs = row.paragraphs as { tokens: { text: string; status: string }[] }[];
    expect(paragraphs).toHaveLength(2);
    const hundToken = paragraphs[0].tokens.find((t) => t.text === 'Hund');
    expect(hundToken?.status).toBe('known');
    const newToken = paragraphs[1].tokens.find((t) => t.text === 'Neugierig');
    expect(newToken?.status).toBe('new');

    expect(row.newWords).toHaveLength(1);

    const glossary = row.glossary as Record<string, { translation: string }>;
    expect(Object.keys(glossary)).toHaveLength(2); // Hund + neugierig
  });

  it('ships a draft containing an unresolvable word and records it in the review queue, never in Lexeme/Sense', async () => {
    const resolver = new LexemeResolver(prisma);

    // 5 known "Hund" repeats dilute one unresolvable word enough to clear the coverage floor.
    const draftJson = { title: 'Hund', story: 'Hund Hund Hund Hund Hund Xyzzyplex.' };
    const router = new FakeRouter('GROQ');
    const groq = new FakeAdapter('GROQ', [draftJson]);
    const ollama = new FakeAdapter('OLLAMA', [draftJson]);
    const aiService = new AiService(router, groq, ollama, 0, checkStoryDraft);

    const result = await generateStoryForUser(prisma, aiService, resolver, imageService, audioService, userId, 'batch', LANG);

    expect(result.status).toBe('shipped');
    if (result.status !== 'shipped') return;
    storyIds.push(result.storyId);

    const entry = await prisma.unresolvedStoryWord.findUnique({ where: { language_surface: { language: LANG, surface: 'Xyzzyplex' } } });
    expect(entry).not.toBeNull();
    expect(entry?.occurrences).toBe(1);
    expect(entry?.sampleStoryId).toBe(result.storyId);

    const hallucinated = await prisma.lexeme.findFirst({ where: { language: LANG, lemma: 'Xyzzyplex' } });
    expect(hallucinated).toBeNull();
  });

  it('skips storing (without retrying or falling back) when coverage falls below the quality floor', async () => {
    const resolver = new LexemeResolver(prisma);

    const draftJson = { title: 'Weird', story: 'Xyzzyplex Qwibbleton Florpnak Hund.' };
    const router = new FakeRouter('GROQ');
    const groq = new FakeAdapter('GROQ', [draftJson]);
    const ollama = new FakeAdapter('OLLAMA', [draftJson]);
    const aiService = new AiService(router, groq, ollama, 0, checkStoryDraft);

    const result = await generateStoryForUser(prisma, aiService, resolver, imageService, audioService, userId, 'batch', LANG);

    expect(result.status).toBe('skipped');
    if (result.status !== 'skipped') return;
    expect(result.reason).toMatch(/^low_coverage_/);
    expect(groq.calls).toBe(1);
    expect(ollama.calls).toBe(0);
  });

  it('lazy trigger never touches OLLAMA — skips outright when the router says quota is exhausted', async () => {
    const resolver = new LexemeResolver(prisma);

    const draftJson = { title: 'Hund', story: 'Hund.\n\nNeugierig.' };
    const router = new FakeRouter('OLLAMA'); // quota exhausted — router would normally fall here
    const groq = new FakeAdapter('GROQ', [draftJson]);
    const ollama = new FakeAdapter('OLLAMA', [draftJson]);
    const aiService = new AiService(router, groq, ollama, 2, checkStoryDraft);

    const result = await generateStoryForUser(prisma, aiService, resolver, imageService, audioService, userId, 'lazy', LANG);

    expect(result).toEqual({ status: 'skipped', reason: 'REMOTE_QUOTA_EXHAUSTED' });
    expect(groq.calls).toBe(0);
    expect(ollama.calls).toBe(0); // the whole point: never loads the local model during a lazy run
  });
});
