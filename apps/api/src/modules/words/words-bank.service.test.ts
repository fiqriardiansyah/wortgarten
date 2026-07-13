import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@wortgarten/database';
import { foldForLookup } from '@wortgarten/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { SrsService } from '../srs/srs.service';
import { WordsService } from './words.service';

const LANG = 'de-words-bank-fixture';

const prisma = new PrismaClient();
const srs = new SrsService(prisma as unknown as PrismaService);
const words = new WordsService(prisma as unknown as PrismaService, srs);

const lexemeIds: string[] = [];
let userAId: string;
let userBId: string;

let hundDogSenseId: string;
let hundPetSenseId: string; // second sense on the same lexeme
let katzeSenseId: string;
let unvollstaendigSenseId: string; // incomplete noun: gender known, plural unknown

async function createLexeme(params: {
  lemma: string;
  partOfSpeech: 'NOUN' | 'VERB';
  gender?: 'MASCULINE' | 'FEMININE' | 'NEUTER';
  plural?: string;
  senses: string[];
  forms: string[];
}) {
  const lexeme = await prisma.lexeme.create({
    data: {
      id: randomUUID(),
      sourceKey: randomUUID(),
      language: LANG,
      lemma: params.lemma,
      partOfSpeech: params.partOfSpeech,
      gender: params.gender,
      plural: params.plural,
      senses: { create: params.senses.map((translation) => ({ id: randomUUID(), sourceKey: randomUUID(), translation })) },
      forms: { create: params.forms.map((surface) => ({ surface, normalized: foldForLookup(surface) })) },
    },
    include: { senses: true },
  });
  lexemeIds.push(lexeme.id);
  return lexeme;
}

beforeAll(async () => {
  const userA = await prisma.user.create({ data: { name: 'Bank Test A', email: `words-bank-a-${Date.now()}@example.com` } });
  const userB = await prisma.user.create({ data: { name: 'Bank Test B', email: `words-bank-b-${Date.now()}@example.com` } });
  userAId = userA.id;
  userBId = userB.id;

  const hund = await createLexeme({
    lemma: 'Hund',
    partOfSpeech: 'NOUN',
    gender: 'MASCULINE',
    plural: 'Hunde',
    senses: ['dog', 'pet (informal)'],
    forms: ['Hund', 'Hunde'],
  });
  hundDogSenseId = hund.senses[0].id;
  hundPetSenseId = hund.senses[1].id;

  const katze = await createLexeme({
    lemma: 'Katze',
    partOfSpeech: 'NOUN',
    gender: 'FEMININE',
    plural: 'Katzen',
    senses: ['cat'],
    forms: ['Katze', 'Katzen'],
  });
  katzeSenseId = katze.senses[0].id;

  const unvollstaendig = await createLexeme({
    lemma: 'Gadget',
    partOfSpeech: 'NOUN',
    gender: 'NEUTER',
    // plural intentionally omitted — an incomplete dictionary entry
    senses: ['gadget'],
    forms: ['Gadget'],
  });
  unvollstaendigSenseId = unvollstaendig.senses[0].id;
});

afterAll(async () => {
  await prisma.userWord.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.lexeme.deleteMany({ where: { id: { in: lexemeIds } } });
  await prisma.$disconnect();
});

describe('WordsService.addWord', () => {
  it('creates a NEW word due immediately', async () => {
    const result = await words.addWord(userAId, { senseId: hundDogSenseId, sourceType: 'search' });
    expect(result.created).toBe(true);

    const stored = await prisma.userWord.findUniqueOrThrow({ where: { id: result.id } });
    expect(stored.level).toBe('NEW');
    expect(stored.dueAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('is idempotent: adding the same sense twice is a no-op, not an error', async () => {
    const first = await words.addWord(userAId, { senseId: hundDogSenseId });
    const second = await words.addWord(userAId, { senseId: hundDogSenseId });
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
  });

  it('a lexeme with two senses is collectable as two independent words', async () => {
    const dog = await words.addWord(userAId, { senseId: hundDogSenseId });
    const pet = await words.addWord(userAId, { senseId: hundPetSenseId });
    expect(dog.id).not.toBe(pet.id);
  });
});

describe('WordsService.addWordsBatch', () => {
  it('skips senses already in the bank and de-dupes within the same batch', async () => {
    // hundDogSenseId is already added by the previous describe block.
    const added = await words.addWordsBatch(userAId, [
      { senseId: hundDogSenseId, sourceSentence: 'Ich habe einen Hund.' },
      { senseId: katzeSenseId, sourceSentence: 'Die Katze schläft.' },
      { senseId: katzeSenseId }, // duplicate within the same batch
    ]);

    expect(added).toHaveLength(1);
    expect(added[0].senseId).toBe(katzeSenseId);

    const stored = await prisma.userWord.findFirstOrThrow({ where: { userId: userAId, senseId: katzeSenseId } });
    expect(stored.sourceSentence).toBe('Die Katze schläft.');
  });
});

describe('WordsService.listWords', () => {
  it('finds a word by its translation ("dog") the same forgiving way search does', async () => {
    const { items } = await words.listWords(userAId, { q: 'dog' });
    expect(items.map((i) => i.lexeme.lemma)).toContain('Hund');
  });

  it('flags an incomplete noun (missing plural)', async () => {
    await words.addWord(userAId, { senseId: unvollstaendigSenseId });
    const { items } = await words.listWords(userAId, { filter: 'incomplete' });
    expect(items.map((i) => i.lexeme.lemma)).toContain('Gadget');
    expect(items.find((i) => i.lexeme.lemma === 'Gadget')?.isIncomplete).toBe(true);
  });

  it('filters by level', async () => {
    const { items } = await words.listWords(userAId, { filter: 'new' });
    expect(items.every((i) => i.level === 'NEW')).toBe(true);
  });

  it('never returns another user’s words', async () => {
    await words.addWord(userBId, { senseId: katzeSenseId });
    const { items } = await words.listWords(userAId, {});
    const userBWord = await prisma.userWord.findFirstOrThrow({ where: { userId: userBId, senseId: katzeSenseId } });
    expect(items.find((i) => i.id === userBWord.id)).toBeUndefined();
  });
});

describe('WordsService.getWordDetail / updateWord / deleteWord — cross-user isolation', () => {
  let userAWordId: string;
  let userBWordId: string;

  beforeAll(async () => {
    // katzeSenseId is already in userA's bank from the addWordsBatch describe block above — idempotent.
    const a = await words.addWord(userAId, { senseId: katzeSenseId });
    userAWordId = a.id;
    const bWord = await prisma.userWord.findFirstOrThrow({ where: { userId: userBId } });
    userBWordId = bWord.id;
  });

  it('getWordDetail returns full detail with an empty attempts history', async () => {
    const detail = await words.getWordDetail(userAId, userAWordId);
    expect(detail.attempts).toEqual([]);
    expect(detail.lexeme.lemma).toBeTruthy();
  });

  it('getWordDetail throws NotFoundException for another user’s word id', async () => {
    await expect(words.getWordDetail(userAId, userBWordId)).rejects.toThrow(NotFoundException);
  });

  it('updateWord sets customTranslation/note for the owner', async () => {
    const updated = await words.updateWord(userAId, userAWordId, { customTranslation: 'kitty', note: 'met at the park' });
    expect(updated.id).toBe(userAWordId);
    const stored = await prisma.userWord.findUniqueOrThrow({ where: { id: userAWordId } });
    expect(stored.customTranslation).toBe('kitty');
    expect(stored.note).toBe('met at the park');
  });

  it('updateWord throws NotFoundException when the word belongs to another user', async () => {
    await expect(words.updateWord(userAId, userBWordId, { note: 'hijack attempt' })).rejects.toThrow(NotFoundException);
  });

  it('deleteWord throws NotFoundException when the word belongs to another user', async () => {
    await expect(words.deleteWord(userAId, userBWordId)).rejects.toThrow(NotFoundException);
    // still there — the failed delete attempt didn't touch it
    await expect(prisma.userWord.findUniqueOrThrow({ where: { id: userBWordId } })).resolves.toBeTruthy();
  });

  it('deleteWord removes the word for its owner', async () => {
    await words.deleteWord(userAId, userAWordId);
    await expect(prisma.userWord.findUnique({ where: { id: userAWordId } })).resolves.toBeNull();
  });
});
