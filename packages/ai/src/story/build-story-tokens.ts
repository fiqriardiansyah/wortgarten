import { displayForm } from '@wortgarten/shared';
import type { StoryDraft, StoryGlossaryEntry, StoryParagraph, StoryToken, StoryTokenStatus } from '@wortgarten/shared';
import type { LexemeResolver, SentenceTokenMatch } from './lexeme-resolver';
import { segmentText } from './segment-text';
import type { StoryVocabulary } from './select-vocabulary';

export interface BuiltStory {
  paragraphs: StoryParagraph[];
  glossary: Record<string, StoryGlossaryEntry>;
  /** lexemeIds of the requested new words that were actually used in the accepted draft. */
  newWords: string[];
  coverageKnownPct: number;
  totalWordCount: number;
}

function statusFor(lexemeId: string, vocab: StoryVocabulary): StoryTokenStatus {
  if (vocab.newWords.some((w) => w.lexemeId === lexemeId)) return 'new';
  if (vocab.knownLexemeIds.has(lexemeId)) return 'known';
  if (vocab.functionLexemeIds.has(lexemeId)) return 'function';
  // The checker already guaranteed every word resolves inside the allowlist — reaching here means
  // the checker and this builder disagree about the same lexeme, a bug, not a data issue. Fail
  // loudly rather than ship an `unknown` token (the frozen contract says that must never happen).
  throw new Error(`lexeme ${lexemeId} resolved but is not known/function/new — checker/builder mismatch`);
}

/**
 * Re-tokenizes an already-checker-approved draft into the frozen StoryToken/StoryGlossaryEntry
 * shape — the worker's overnight tokenMap precompute, so the Reader does zero runtime NLP. Reuses
 * the exact same resolution the checker ran (cheap; only runs once, on the winning draft).
 */
export async function buildStoryFromDraft(
  resolver: LexemeResolver,
  vocab: StoryVocabulary,
  draft: StoryDraft,
  language = 'de',
): Promise<BuiltStory> {
  const glossary: Record<string, StoryGlossaryEntry> = {};
  const usedLexemeIds = new Set<string>();
  let totalWordCount = 0;

  const paragraphs: StoryParagraph[] = [];

  for (const paragraphText of draft.paragraphs) {
    const { normalized, segments } = segmentText(paragraphText);
    const slots = await resolver.lookupSentence(normalized, language);

    const slotByWordIndex = new Map<number, SentenceTokenMatch>();
    for (const slot of slots) {
      for (const idx of slot.tokenIndices) slotByWordIndex.set(idx, slot);
    }

    const tokens: StoryToken[] = segments.map((segment): StoryToken => {
      if (segment.kind !== 'word') {
        return { text: segment.text, kind: segment.kind, lexemeId: null, senseId: null, status: 'function' };
      }

      totalWordCount++;
      const slot = slotByWordIndex.get(segment.wordIndex!);
      const hit = slot?.matches.find((m) => vocab.allowlistIds.has(m.lexeme.id));
      if (!hit) {
        throw new Error(`word "${segment.text}" did not resolve inside the allowlist — checker/builder mismatch`);
      }

      const lexemeId = hit.lexeme.id;
      const status = statusFor(lexemeId, vocab);
      usedLexemeIds.add(lexemeId);

      // Must agree with the glossary's own sense choice below (`translationSense`) — the popup
      // shows sense[0]'s translation for any lexeme with no known sense, so "+ Add to my words"
      // has to add that same sense, not bail out just because the lexeme happens to be polysemous.
      const knownSenseId = vocab.knownSenseByLexeme.get(lexemeId);
      const senseId = knownSenseId ?? hit.senses[0]?.id ?? null;

      if (!glossary[lexemeId]) {
        const translationSense = (knownSenseId ? hit.senses.find((s) => s.id === knownSenseId) : undefined) ?? hit.senses[0];
        glossary[lexemeId] = {
          lexemeId,
          displayLemma: displayForm({ lemma: hit.lexeme.lemma, partOfSpeech: hit.lexeme.partOfSpeech, gender: hit.lexeme.gender }),
          pos: hit.lexeme.partOfSpeech.toLowerCase(),
          translation: translationSense?.translation ?? hit.lexeme.lemma,
        };
      }

      return { text: segment.text, kind: 'word', lexemeId, senseId, status };
    });

    paragraphs.push({ tokens });
  }

  const newWords = vocab.newWords.filter((w) => usedLexemeIds.has(w.lexemeId)).map((w) => w.lexemeId);
  // Always 100 for a shipped story: every word token above resolved to known/function/new, or the
  // builder threw before reaching here — there is no `unknown` case left standing to lower it.
  const coverageKnownPct = 100;

  return { paragraphs, glossary, newWords, coverageKnownPct, totalWordCount };
}
