import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@wortgarten/database';
import { foldForLookup } from '@wortgarten/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { LookupService } from '../lexicon/lookup.service';
import { SrsService } from '../srs/srs.service';
import { SessionBuilderService } from './session-builder.service';
import { SessionGradingService } from './session-grading.service';

// Synthetic fixtures under a distinct language tag — same convention as
// words-bank.service.test.ts — so this suite never depends on (or breaks from) the real seeded
// 'de' dictionary. The scenarios below were first proven against real seeded data during manual
// live-verification of the session player, which is how two real bugs were caught: a NULL-unsafe
// ORDER BY in the sentence-selection query, and the umlaut "teaching moment" picking a same-spelled
// homograph of the TARGET word instead of the word the user actually typed.
const LANG = 'de-session-fixture';

const prisma = new PrismaClient();
const prismaService = prisma as unknown as PrismaService;
const srs = new SrsService(prismaService);
const lookup = new LookupService(prismaService);
const builder = new SessionBuilderService(prismaService, srs);
const grading = new SessionGradingService(prismaService, srs, lookup);

const lexemeIds: string[] = [];
let userId: string;
let fensterUserWordId: string;
let fensterSenseId: string;
let schoenUserWordId: string;
let incompleteUserWordId: string;
let werkzeugUserWordId: string;
let bankFinancialUserWordId: string;
let seeSeaUserWordId: string;

async function createLexeme(params: {
  lemma: string;
  partOfSpeech: 'NOUN' | 'ADJECTIVE' | 'ADVERB';
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

async function submitOne(userWordId: string, text: string, responseTimeMs = 2000) {
  const [item] = await builder.composePracticePlan(userId, 1, userWordId);
  if (item.taskType !== 'TYPE_WORD') throw new Error(`expected TYPE_WORD, got ${item.taskType}`);
  const session = await prisma.drillSession.create({
    data: { userId, plan: [item] as unknown as object, status: 'ACTIVE', currentIndex: 0, isPractice: false },
  });
  const response = await grading.submitAttempt(session, { planItemId: item.id, response: { taskType: 'TYPE_WORD', text }, responseTimeMs });
  return { response, session, item };
}

beforeAll(async () => {
  const user = await prisma.user.create({ data: { name: 'Session Fixture', email: `session-fixture-${Date.now()}@example.com` } });
  userId = user.id;

  const fenster = await createLexeme({ lemma: 'Fenster', partOfSpeech: 'NOUN', gender: 'NEUTER', plural: 'Fenster', senses: ['window'], forms: ['Fenster'] });
  fensterSenseId = fenster.senses[0].id;
  const fensterUw = await prisma.userWord.create({ data: { userId, senseId: fensterSenseId, level: 'RECALL', reps: 3, dueAt: new Date() } });
  fensterUserWordId = fensterUw.id;

  // schön (has an umlaut) plus a genuinely independent "schon" lexeme — the real word the folded
  // spelling literally reads as. The teaching-moment contrast must find THIS one, not another
  // "schön"-spelled homograph, however the dictionary happens to rank matches.
  const schoen = await createLexeme({ lemma: 'schön', partOfSpeech: 'ADJECTIVE', senses: ['beautiful'], forms: ['schön'] });
  await createLexeme({ lemma: 'schon', partOfSpeech: 'ADVERB', senses: ['already'], forms: ['schon'] });
  const schoenUw = await prisma.userWord.create({ data: { userId, senseId: schoen.senses[0].id, level: 'RECALL', reps: 2, dueAt: new Date() } });
  schoenUserWordId = schoenUw.id;

  // PICK_MEANING needs 3 distractor senses of the same POS — a tiny fixture language needs a
  // few more nouns in the pool for that to succeed (real 'de' has thousands; this doesn't).
  await createLexeme({ lemma: 'Tisch', partOfSpeech: 'NOUN', gender: 'MASCULINE', plural: 'Tische', senses: ['table'], forms: ['Tisch'] });
  await createLexeme({ lemma: 'Stuhl', partOfSpeech: 'NOUN', gender: 'MASCULINE', plural: 'Stühle', senses: ['chair'], forms: ['Stuhl'] });
  await createLexeme({ lemma: 'Lampe', partOfSpeech: 'NOUN', gender: 'FEMININE', plural: 'Lampen', senses: ['lamp'], forms: ['Lampe'] });

  const incomplete = await createLexeme({ lemma: 'Gadget', partOfSpeech: 'NOUN', gender: 'NEUTER', senses: ['gadget'], forms: ['Gadget'] }); // plural omitted -> incomplete
  const incompleteUw = await prisma.userWord.create({ data: { userId, senseId: incomplete.senses[0].id, level: 'RECOGNIZE', reps: 1, dueAt: new Date() } });
  incompleteUserWordId = incompleteUw.id;

  const werkzeug = await createLexeme({ lemma: 'Werkzeug', partOfSpeech: 'NOUN', gender: 'NEUTER', plural: 'Werkzeuge', senses: ['tool'], forms: ['Werkzeug'] });
  const werkzeugUw = await prisma.userWord.create({ data: { userId, senseId: werkzeug.senses[0].id, level: 'RECALL', reps: 1, dueAt: new Date() } });
  werkzeugUserWordId = werkzeugUw.id;

  // die Bank (bench) / die Bank (financial institution) — two Lexeme rows, identical lemma AND
  // gender, so the bare prompt "die Bank" would be genuinely ambiguous between them. Both go in
  // the user's bank, same as the real reported repro.
  const bankBench = await createLexeme({ lemma: 'Bank', partOfSpeech: 'NOUN', gender: 'FEMININE', plural: 'Bänke', senses: ['bench'], forms: ['Bank'] });
  const bankFinancial = await createLexeme({ lemma: 'Bank', partOfSpeech: 'NOUN', gender: 'FEMININE', plural: 'Banken', senses: ['bank (financial institution)'], forms: ['Bank'] });
  await prisma.userWord.create({ data: { userId, senseId: bankBench.senses[0].id, level: 'NEW' } });
  const bankFinancialUw = await prisma.userWord.create({ data: { userId, senseId: bankFinancial.senses[0].id, level: 'NEW' } });
  bankFinancialUserWordId = bankFinancialUw.id;

  // der See (lake) / die See (sea) — same lemma, DIFFERENT gender, so the article alone already
  // disambiguates the prompt text. Distractor exclusion must still hold even without a prompt hint.
  const seeLake = await createLexeme({ lemma: 'See', partOfSpeech: 'NOUN', gender: 'MASCULINE', plural: 'Seen', senses: ['lake'], forms: ['See'] });
  const seeSea = await createLexeme({ lemma: 'See', partOfSpeech: 'NOUN', gender: 'FEMININE', plural: 'Seen', senses: ['sea'], forms: ['See'] });
  await prisma.userWord.create({ data: { userId, senseId: seeLake.senses[0].id, level: 'NEW' } });
  const seeSeaUw = await prisma.userWord.create({ data: { userId, senseId: seeSea.senses[0].id, level: 'NEW' } });
  seeSeaUserWordId = seeSeaUw.id;
}, 30000);

afterAll(async () => {
  await prisma.attempt.deleteMany({ where: { userWord: { userId } } });
  await prisma.drillSession.deleteMany({ where: { userId } });
  await prisma.userWord.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.lexeme.deleteMany({ where: { id: { in: lexemeIds } } });
  await prisma.$disconnect();
}, 30000);

describe('session grading — WRONG_GENDER / MISSING_ARTICLE / MISSING_UMLAUT (acceptance 1-3)', () => {
  it('der Fenster (wrong article) -> WRONG_GENDER: holds the ladder, rates Hard, requeues', async () => {
    const before = await prisma.userWord.findUniqueOrThrow({ where: { id: fensterUserWordId } });
    const { response, session, item } = await submitOne(fensterUserWordId, 'der Fenster');

    expect(response.result).toBe('WRONG_GENDER');
    expect(response.climbed).toBe(false);
    expect(response.requeued).toBe(true);
    expect(response.correction?.tip).toContain('neuter');

    const after = await prisma.userWord.findUniqueOrThrow({ where: { id: fensterUserWordId } });
    expect(after.level).toBe(before.level); // holds, does not drop

    const attempt = await prisma.attempt.findUniqueOrThrow({
      where: { drillSessionId_planItemId: { drillSessionId: session.id, planItemId: item.id } },
    });
    expect(attempt.rating).toBe('HARD'); // not AGAIN — the word is known, the article was wrong
  });

  it('bare Fenster (no article at all) -> MISSING_ARTICLE, a different result and tip than WRONG_GENDER', async () => {
    const { response } = await submitOne(fensterUserWordId, 'Fenster');
    expect(response.result).toBe('MISSING_ARTICLE');
    expect(response.correction?.tip).not.toContain('neuter');
  });

  it('exact match -> CORRECT, climbs the ladder', async () => {
    const { response } = await submitOne(fensterUserWordId, 'das Fenster');
    expect(response.result).toBe('CORRECT');
    expect(response.climbed).toBe(true);
  });

  it('schon for schön -> MISSING_UMLAUT, contrasting the real word the user actually typed', async () => {
    const { response } = await submitOne(schoenUserWordId, 'schon');
    expect(response.result).toBe('MISSING_UMLAUT');
    expect(response.correction?.tip).toContain('schon');
    expect(response.correction?.tip).toMatch(/already/i);
  });
});

describe('session grading — retry mechanics and idempotency (acceptance 4-5, 19)', () => {
  it('a failed retry does not restore the ladder; two honest Attempt rows; duplicate submits are idempotent', async () => {
    const before = await prisma.userWord.findUniqueOrThrow({ where: { id: fensterUserWordId } });
    const { response: fail, session, item } = await submitOne(fensterUserWordId, 'komplett falsch');
    expect(fail.result).toBe('WRONG_MEANING');
    expect(fail.requeued).toBe(true);
    const practicedCountAfterFail = fail.practicedCount;

    const afterFail = await prisma.userWord.findUniqueOrThrow({ where: { id: fensterUserWordId } });
    expect(afterFail.level).not.toBe(before.level); // dropped one rung — WRONG_MEANING is the only result that does

    // A duplicate of the ORIGINAL submit must not re-grade or double-write.
    const duplicate = await grading.submitAttempt(session, {
      planItemId: item.id,
      response: { taskType: 'TYPE_WORD', text: 'anything' },
      responseTimeMs: 500,
    });
    expect(duplicate.result).toBe('WRONG_MEANING'); // original stored result, not re-graded
    const attemptsForOriginal = await prisma.attempt.count({ where: { drillSessionId: session.id, planItemId: item.id } });
    expect(attemptsForOriginal).toBe(1);

    const refreshedSession = await prisma.drillSession.findUniqueOrThrow({ where: { id: session.id } });
    const plan = refreshedSession.plan as unknown as { id: string; isRetry: boolean }[];
    const retryItem = plan.find((p) => p.isRetry);
    expect(retryItem).toBeDefined();

    const pass = await grading.submitAttempt(refreshedSession, {
      planItemId: retryItem!.id,
      response: { taskType: 'TYPE_WORD', text: 'das Fenster' },
      responseTimeMs: 1000,
    });
    expect(pass.result).toBe('CORRECT');
    expect(pass.practicedCount).toBe(practicedCountAfterFail); // the retry pass does not move the counter

    const attempts = await prisma.attempt.findMany({ where: { drillSessionId: session.id, userWordId: fensterUserWordId } });
    expect(attempts).toHaveLength(2); // fail + retry-pass
    expect(attempts.filter((a) => a.isRetry)).toHaveLength(1);

    const finalWord = await prisma.userWord.findUniqueOrThrow({ where: { id: fensterUserWordId } });
    expect(finalWord.level).toBe(afterFail.level); // looks wrong, is correct: the retry does not restore the level
  });
});

describe('session grading — incomplete nouns and practice sessions (acceptance 13, 20)', () => {
  it('an incomplete noun (no plural) is served PICK_MEANING and cannot climb past RECOGNIZE', async () => {
    const [item] = await builder.composePracticePlan(userId, 1, incompleteUserWordId);
    expect(item.taskType).toBe('PICK_MEANING');
    if (item.taskType !== 'PICK_MEANING') throw new Error('expected PICK_MEANING');

    const session = await prisma.drillSession.create({
      data: { userId, plan: [item] as unknown as object, status: 'ACTIVE', currentIndex: 0, isPractice: false },
    });
    const response = await grading.submitAttempt(session, {
      planItemId: item.id,
      response: { taskType: 'PICK_MEANING', selectedOptionId: item.solution.correctOptionId },
      responseTimeMs: 2000,
    });
    expect(response.result).toBe('CORRECT');
    expect(response.climbed).toBe(false); // RECOGNIZE is the ceiling for an incomplete noun

    const after = await prisma.userWord.findUniqueOrThrow({ where: { id: incompleteUserWordId } });
    expect(after.level).toBe('RECOGNIZE');
  });

  it('an isPractice session records the Attempt but never touches FSRS state or the ladder', async () => {
    const before = await prisma.userWord.findUniqueOrThrow({ where: { id: werkzeugUserWordId } });

    const plan = await builder.composePracticePlan(userId, 1, werkzeugUserWordId);
    const item = plan[0];
    if (item.taskType !== 'TYPE_WORD') throw new Error('expected TYPE_WORD');
    const practiceSession = await prisma.drillSession.create({
      data: { userId, plan: plan as unknown as object, status: 'ACTIVE', currentIndex: 0, isPractice: true },
    });
    await grading.submitAttempt(practiceSession, {
      planItemId: item.id,
      response: { taskType: 'TYPE_WORD', text: item.solution.lemma },
      responseTimeMs: 1000,
    });

    const after = await prisma.userWord.findUniqueOrThrow({ where: { id: werkzeugUserWordId } });
    expect(after.dueAt.getTime()).toBe(before.dueAt.getTime());
    expect(after.stability).toBe(before.stability);
    expect(after.level).toBe(before.level);

    const attemptRow = await prisma.attempt.findFirst({ where: { drillSessionId: practiceSession.id } });
    expect(attemptRow).not.toBeNull(); // Attempt IS written, just never touches FSRS
  });
});

describe('session builder — PICK_MEANING on a homograph pair does not offer two correct answers', () => {
  it('die Bank (financial) never offers die Bank (bench) as a distractor, and the prompt disambiguates via the plural', async () => {
    const [item] = await builder.composePracticePlan(userId, 1, bankFinancialUserWordId);
    expect(item.taskType).toBe('PICK_MEANING');
    if (item.taskType !== 'PICK_MEANING') throw new Error('expected PICK_MEANING');

    // Same lemma + same gender -> the bare prompt would be ambiguous -> disambiguating hint required.
    expect(item.payload.prompt).toBe('die Bank (die Banken)');

    const optionSenses = await prisma.sense.findMany({ where: { id: { in: item.payload.options.map((o) => o.id) } } });
    expect(optionSenses.some((s) => s.translation === 'bench')).toBe(false); // the sibling sense never leaks in as a distractor

    // Exactly one option resolves to the target sense.
    expect(item.payload.options.filter((o) => o.id === item.solution.correctOptionId)).toHaveLength(1);
  });

  it('der See / die See: different genders already disambiguate the prompt text, but distractor exclusion still holds', async () => {
    const [item] = await builder.composePracticePlan(userId, 1, seeSeaUserWordId);
    expect(item.taskType).toBe('PICK_MEANING');
    if (item.taskType !== 'PICK_MEANING') throw new Error('expected PICK_MEANING');

    expect(item.payload.prompt).toBe('die See'); // article alone already disambiguates -> no hint needed
    const optionSenses = await prisma.sense.findMany({ where: { id: { in: item.payload.options.map((o) => o.id) } } });
    expect(optionSenses.some((s) => s.translation === 'lake')).toBe(false); // der See's sense never leaks in
  });

  it('selecting the correct financial-institution option grades CORRECT, not WRONG_MEANING', async () => {
    const [item] = await builder.composePracticePlan(userId, 1, bankFinancialUserWordId);
    if (item.taskType !== 'PICK_MEANING') throw new Error('expected PICK_MEANING');
    const session = await prisma.drillSession.create({
      data: { userId, plan: [item] as unknown as object, status: 'ACTIVE', currentIndex: 0, isPractice: false },
    });
    const response = await grading.submitAttempt(session, {
      planItemId: item.id,
      response: { taskType: 'PICK_MEANING', selectedOptionId: item.solution.correctOptionId },
      responseTimeMs: 1500,
    });
    expect(response.result).toBe('CORRECT');
  });
});
