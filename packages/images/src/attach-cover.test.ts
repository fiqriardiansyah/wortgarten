import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@wortgarten/database';
import { attachStoryCover } from './attach-cover';
import type { GenerateStoryCoverResult } from './image.service';
import type { ImageService } from './image.service';

const prisma = new PrismaClient();
let userId: string;
let storyId: string;

class FakeImageService implements Pick<ImageService, 'generateStoryCover'> {
  calls = 0;
  constructor(private readonly result: GenerateStoryCoverResult) {}
  async generateStoryCover(): Promise<GenerateStoryCoverResult> {
    this.calls++;
    return this.result;
  }
}

async function freshStory(): Promise<string> {
  const story = await prisma.story.create({
    data: {
      userId,
      title: 'Test',
      paragraphs: [],
      newWords: [],
      glossary: {},
      coverageKnownPct: 100,
      estMinutes: 1,
    },
  });
  return story.id;
}

beforeAll(async () => {
  const user = await prisma.user.create({ data: { name: 'Attach Cover Test', email: `attach-cover-test-${Date.now()}@example.com` } });
  userId = user.id;
});

afterAll(async () => {
  await prisma.story.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

const savedEnv = { enabled: process.env.STORY_IMAGES_ENABLED, maxPerDay: process.env.STORY_IMAGES_MAX_PER_DAY };

beforeEach(async () => {
  storyId = await freshStory();
});

afterEach(() => {
  if (savedEnv.enabled === undefined) delete process.env.STORY_IMAGES_ENABLED;
  else process.env.STORY_IMAGES_ENABLED = savedEnv.enabled;
  if (savedEnv.maxPerDay === undefined) delete process.env.STORY_IMAGES_MAX_PER_DAY;
  else process.env.STORY_IMAGES_MAX_PER_DAY = savedEnv.maxPerDay;
});

describe('attachStoryCover', () => {
  it('no-ops when the flag is off (default) — never calls the image service or touches the row', async () => {
    delete process.env.STORY_IMAGES_ENABLED;
    const fake = new FakeImageService({ ok: true, key: 'stories/should-not-be-used.png' });

    await attachStoryCover(prisma, fake as unknown as ImageService, storyId, 'a dog in a park');

    expect(fake.calls).toBe(0);
    const row = await prisma.story.findUniqueOrThrow({ where: { id: storyId } });
    expect(row.coverImageKey).toBeNull();
  });

  it('skips when STORY_IMAGES_MAX_PER_DAY is already reached — no image call, no db write', async () => {
    process.env.STORY_IMAGES_ENABLED = 'true';
    process.env.STORY_IMAGES_MAX_PER_DAY = '0';
    const fake = new FakeImageService({ ok: true, key: 'stories/should-not-be-used.png' });

    await attachStoryCover(prisma, fake as unknown as ImageService, storyId, 'a dog in a park');

    expect(fake.calls).toBe(0);
    const row = await prisma.story.findUniqueOrThrow({ where: { id: storyId } });
    expect(row.coverImageKey).toBeNull();
  });

  it('writes the returned key to the story row on success', async () => {
    process.env.STORY_IMAGES_ENABLED = 'true';
    delete process.env.STORY_IMAGES_MAX_PER_DAY;
    const fake = new FakeImageService({ ok: true, key: `stories/${storyId}.png` });

    await attachStoryCover(prisma, fake as unknown as ImageService, storyId, 'a dog in a park');

    expect(fake.calls).toBe(1);
    const row = await prisma.story.findUniqueOrThrow({ where: { id: storyId } });
    expect(row.coverImageKey).toBe(`stories/${storyId}.png`);
  });

  it('never throws and never writes on failure', async () => {
    process.env.STORY_IMAGES_ENABLED = 'true';
    delete process.env.STORY_IMAGES_MAX_PER_DAY;
    const fake = new FakeImageService({ ok: false, error: 'gemini timed out' });

    await expect(attachStoryCover(prisma, fake as unknown as ImageService, storyId, 'a dog in a park')).resolves.toBeUndefined();

    const row = await prisma.story.findUniqueOrThrow({ where: { id: storyId } });
    expect(row.coverImageKey).toBeNull();
  });
});
