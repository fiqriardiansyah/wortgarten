import type { Lexeme, PrismaClient } from '@wortgarten/database';
import { displayForm, isKnownLevel } from '@wortgarten/shared';
import { FUNCTION_WORD_RANK_CEILING } from '../story/select-vocabulary';

/** Same shape `selectStoryVocabulary` returns minus `newWords`/`targetWordCount` — a chat reply
 * never introduces a new word, it only ever stays inside what the reader already has. */
export interface ChatVocabulary {
  knownLexemeIds: Set<string>;
  functionLexemeIds: Set<string>;
  knownSenseByLexeme: Map<string, string>;
  allowlistIds: Set<string>;
  allowlistDisplay: string[];
}

function toDisplayLemma(lexeme: Lexeme): string {
  return displayForm({ lemma: lexeme.lemma, partOfSpeech: lexeme.partOfSpeech, gender: lexeme.gender });
}

/**
 * A lighter `selectStoryVocabulary`: no `MIN_KNOWN_WORDS_FOR_STORY` floor — a total beginner with
 * zero known words still gets a (function-words-only) capped reply from the default host instead
 * of being blocked, unlike a story (which needs enough known words to be worth generating at all).
 */
export async function selectChatVocabulary(prisma: PrismaClient, userId: string, language = 'de'): Promise<ChatVocabulary> {
  const userWords = await prisma.userWord.findMany({
    where: { userId, sense: { lexeme: { language } } },
    select: { level: true, senseId: true, sense: { select: { lexemeId: true, lexeme: true } } },
  });

  const knownLexemes = new Map<string, Lexeme>();
  const knownSenseByLexeme = new Map<string, string>();
  for (const uw of userWords) {
    if (isKnownLevel(uw.level)) {
      knownLexemes.set(uw.sense.lexemeId, uw.sense.lexeme);
      knownSenseByLexeme.set(uw.sense.lexemeId, uw.senseId);
    }
  }

  const functionLexemes = await prisma.lexeme.findMany({
    where: { language, frequencyRank: { lte: FUNCTION_WORD_RANK_CEILING } },
  });
  const functionLexemeIds = new Set(functionLexemes.map((l) => l.id));

  const allowlistIds = new Set<string>([...knownLexemes.keys(), ...functionLexemeIds]);

  const seenDisplay = new Set<string>();
  const allowlistDisplay: string[] = [];
  const addDisplay = (d: string) => {
    if (!seenDisplay.has(d)) {
      seenDisplay.add(d);
      allowlistDisplay.push(d);
    }
  };
  for (const lexeme of knownLexemes.values()) addDisplay(toDisplayLemma(lexeme));
  for (const lexeme of functionLexemes) addDisplay(toDisplayLemma(lexeme));

  return {
    knownLexemeIds: new Set(knownLexemes.keys()),
    functionLexemeIds,
    knownSenseByLexeme,
    allowlistIds,
    allowlistDisplay,
  };
}
