import type { Lexeme, PrismaClient, WordLevel } from '@wortgarten/database';
import { displayForm } from '@wortgarten/shared';

// Articles, prepositions, conjunctions, pronouns everyone meets almost immediately — without
// these the model can't form a grammatical sentence at all, so they're always allowed even if
// the user hasn't explicitly added them to their bank.
export const FUNCTION_WORD_RANK_CEILING = 200;
// Below this many known words, a story would either be trivially short or forced to lean almost
// entirely on function words — better to skip generation than ship something thin.
export const MIN_KNOWN_WORDS_FOR_STORY = 15;
const NEW_WORD_COUNT = 2;
// ~60-120 words keeps a 3B local model coherent and gives the checker less to reject.
export const STORY_TARGET_WORD_COUNT = 100;

const KNOWN_LEVELS: WordLevel[] = ['RECOGNIZE', 'RECALL', 'PRODUCE', 'MASTERED'];

export interface StoryVocabularyWord {
  lexemeId: string;
  displayLemma: string;
}

export interface StoryVocabulary {
  knownLexemeIds: Set<string>;
  functionLexemeIds: Set<string>;
  /** lexemeId -> the sense the user actually has in their bank, so glossary/senseId for a known
   * word matches what they already learned rather than an arbitrary sense of a polysemous lexeme. */
  knownSenseByLexeme: Map<string, string>;
  /** The 1-2 words this story is built to teach, most-frequent-unknown first. */
  newWords: StoryVocabularyWord[];
  /** known ∪ function ∪ new — the checker's ground truth, compared by id, never by string. */
  allowlistIds: Set<string>;
  /** Deduped display lemmas ("der Hund", not "Hund") for the prompt's word list. */
  allowlistDisplay: string[];
  targetWordCount: number;
}

function toDisplayLemma(lexeme: Lexeme): string {
  return displayForm({ lemma: lexeme.lemma, partOfSpeech: lexeme.partOfSpeech, gender: lexeme.gender });
}

/**
 * Plain code — the model never sees this decision, only its output (the doc's core safety
 * mechanism). Returns null when the user has too few known words to make a story worth shipping.
 */
export async function selectStoryVocabulary(prisma: PrismaClient, userId: string, language = 'de'): Promise<StoryVocabulary | null> {
  const userWords = await prisma.userWord.findMany({
    where: { userId, sense: { lexeme: { language } } },
    select: { level: true, senseId: true, sense: { select: { lexemeId: true, lexeme: true } } },
  });

  const bankLexemeIds = new Set(userWords.map((uw) => uw.sense.lexemeId));
  const knownLexemes = new Map<string, Lexeme>();
  const knownSenseByLexeme = new Map<string, string>();
  for (const uw of userWords) {
    if (KNOWN_LEVELS.includes(uw.level)) {
      knownLexemes.set(uw.sense.lexemeId, uw.sense.lexeme);
      knownSenseByLexeme.set(uw.sense.lexemeId, uw.senseId);
    }
  }

  if (knownLexemes.size < MIN_KNOWN_WORDS_FOR_STORY) return null;

  const functionLexemes = await prisma.lexeme.findMany({
    where: { language, frequencyRank: { lte: FUNCTION_WORD_RANK_CEILING } },
  });
  const functionLexemeIds = new Set(functionLexemes.map((l) => l.id));

  // Not already in the bank at ANY level (even NEW) — a word the user is already mid-learning
  // elsewhere isn't a fresh comprehensible-input hook for this story.
  const excludeIds = [...new Set([...bankLexemeIds, ...functionLexemeIds])];
  const newWordCandidates = await prisma.lexeme.findMany({
    where: { language, frequencyRank: { gt: FUNCTION_WORD_RANK_CEILING }, id: { notIn: excludeIds } },
    orderBy: { frequencyRank: 'asc' },
    take: NEW_WORD_COUNT,
  });
  const newWords: StoryVocabularyWord[] = newWordCandidates.map((l) => ({ lexemeId: l.id, displayLemma: toDisplayLemma(l) }));

  const allowlistIds = new Set<string>([...knownLexemes.keys(), ...functionLexemeIds, ...newWords.map((w) => w.lexemeId)]);

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
  for (const w of newWords) addDisplay(w.displayLemma);

  return {
    knownLexemeIds: new Set(knownLexemes.keys()),
    functionLexemeIds,
    knownSenseByLexeme,
    newWords,
    allowlistIds,
    allowlistDisplay,
    targetWordCount: STORY_TARGET_WORD_COUNT,
  };
}
