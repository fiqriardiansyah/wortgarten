import { displayForm, tokenize } from '@wortgarten/shared';
import type { StoryDraft, StoryGlossaryEntry, StoryParagraph, StoryToken, StoryTokenStatus } from '@wortgarten/shared';
import type { LexemeMatch, LexemeResolver, SentenceTokenMatch } from './lexeme-resolver';
import { segmentText } from './segment-text';
import type { StoryVocabulary } from './select-vocabulary';

export interface BuiltStory {
  paragraphs: StoryParagraph[];
  glossary: Record<string, StoryGlossaryEntry>;
  /** lexemeIds of the requested new words that were actually used in the accepted draft. */
  newWords: string[];
  coverageKnownPct: number;
  totalWordCount: number;
  translation: string | null;
  /** Surface forms that resolved to nothing at all (hallucination/name/typo/unhandled inflection).
   * Never written to Lexeme/Sense — a diagnostic for the offline review queue only. */
  unresolvedSurfaces: string[];
}

// A draft naturally over/undershoots its target word count a bit — rejecting (or truncating)
// anything even slightly over target would throw away an otherwise-good story for nothing. Only
// trims when the draft runs well past target.
const LENGTH_SLACK = 1.6;

function splitParagraphTexts(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Keeps whole paragraphs only — trims at the last complete paragraph that fits inside the slack
 * budget, always keeping at least the first one however long it runs on its own. */
function truncateToTarget(paragraphs: string[], maxWords: number): string[] {
  if (paragraphs.length === 0) return [];
  const limit = maxWords * LENGTH_SLACK;
  const kept = [paragraphs[0]];
  let total = tokenize(paragraphs[0]).length;
  for (let i = 1; i < paragraphs.length; i++) {
    const words = tokenize(paragraphs[i]).length;
    if (total + words > limit) break;
    kept.push(paragraphs[i]);
    total += words;
  }
  return kept;
}

function statusFor(lexemeId: string, vocab: StoryVocabulary): StoryTokenStatus {
  if (vocab.newWords.some((w) => w.lexemeId === lexemeId)) return 'new';
  if (vocab.knownLexemeIds.has(lexemeId)) return 'known';
  if (vocab.functionLexemeIds.has(lexemeId)) return 'function';
  // Defensive only: every caller already gated on allowlist membership before reaching here, so
  // this branch is unreachable in practice. Never throw over it — an unexpected mismatch isn't
  // worth failing a whole story.
  return 'unknown';
}

function glossaryEntryFor(hit: LexemeMatch, knownSenseId?: string): StoryGlossaryEntry {
  const translationSense = (knownSenseId ? hit.senses.find((s) => s.id === knownSenseId) : undefined) ?? hit.senses[0];
  return {
    lexemeId: hit.lexeme.id,
    displayLemma: displayForm({ lemma: hit.lexeme.lemma, partOfSpeech: hit.lexeme.partOfSpeech, gender: hit.lexeme.gender }),
    pos: hit.lexeme.partOfSpeech.toLowerCase(),
    translation: translationSense?.translation ?? hit.lexeme.lemma,
  };
}

/**
 * Re-tokenizes an already-checker-approved draft into the frozen StoryToken/StoryGlossaryEntry
 * shape — the worker's overnight tokenMap precompute, so the Reader does zero runtime NLP.
 * Resolution against the dictionary happens exactly once, here — the checker no longer does any
 * DB lookup of its own. A word outside the allowlist is never an error: it either resolves to a
 * real (non-allowlisted) lexeme — comprehensible input, glossaried, `status: 'unknown'` with a
 * real `lexemeId` — or resolves to nothing at all, in which case it ships as plain, unglossaried
 * text (`lexemeId: null`) and its surface form is collected for the offline review queue.
 */
export async function buildStoryFromDraft(
  resolver: LexemeResolver,
  vocab: StoryVocabulary,
  draft: StoryDraft,
  language = 'de',
): Promise<BuiltStory> {
  console.log(`[buildStoryFromDraft] in: title="${draft.title}" language=${language}`);
  const rawParagraphs = splitParagraphTexts(draft.story);
  const paragraphTexts = truncateToTarget(rawParagraphs, vocab.targetWordCount);

  const rawTranslationParagraphs = draft.translation ? splitParagraphTexts(draft.translation) : [];
  const translation = rawTranslationParagraphs.length > 0 ? rawTranslationParagraphs.slice(0, paragraphTexts.length).join('\n\n') : null;

  const glossary: Record<string, StoryGlossaryEntry> = {};
  const usedLexemeIds = new Set<string>();
  const unresolvedSurfaces: string[] = [];
  let totalWordCount = 0;
  let unknownWordCount = 0;

  const paragraphs: StoryParagraph[] = [];

  for (const paragraphText of paragraphTexts) {
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
      const allowlistHit = slot?.matches.find((m) => vocab.allowlistIds.has(m.lexeme.id));

      if (allowlistHit) {
        const lexemeId = allowlistHit.lexeme.id;
        const status = statusFor(lexemeId, vocab);
        usedLexemeIds.add(lexemeId);

        const knownSenseId = vocab.knownSenseByLexeme.get(lexemeId);
        const senseId = knownSenseId ?? allowlistHit.senses[0]?.id ?? null;

        if (!glossary[lexemeId]) glossary[lexemeId] = glossaryEntryFor(allowlistHit, knownSenseId);

        return { text: segment.text, kind: 'word', lexemeId, senseId, status };
      }

      // Resolves to a real lexeme, just not one on this user's allowlist (e.g. "Katze") — the
      // comprehensible-input mechanic, not a defect. Glossaried so tapping still works. Still
      // carries a senseId (fallback to the lexeme's first sense) — WordPopup's "+ Add to my
      // words" is deliberately offered for 'unknown' tokens too (see WordPopup's isAddable), so
      // a null senseId here would make every such tap fail in useMarkWordKnown.
      const outsideHit = slot?.matches[0];
      if (outsideHit) {
        unknownWordCount++;
        const lexemeId = outsideHit.lexeme.id;
        const senseId = outsideHit.senses[0]?.id ?? null;
        if (!glossary[lexemeId]) glossary[lexemeId] = glossaryEntryFor(outsideHit);
        return { text: segment.text, kind: 'word', lexemeId, senseId, status: 'unknown' };
      }

      // Resolves to nothing at all — hallucination, invented name, typo, or an inflection
      // LookupService doesn't handle. Ordinary expected case: ships as plain text, never thrown.
      unknownWordCount++;
      unresolvedSurfaces.push(segment.text);
      return { text: segment.text, kind: 'word', lexemeId: null, senseId: null, status: 'unknown' };
    });

    paragraphs.push({ tokens });
  }

  const newWords = vocab.newWords.filter((w) => usedLexemeIds.has(w.lexemeId)).map((w) => w.lexemeId);
  const coverageKnownPct = totalWordCount === 0 ? 100 : Math.round(((totalWordCount - unknownWordCount) / totalWordCount) * 100);

  console.log(
    `[buildStoryFromDraft] out: paragraphs=${paragraphs.length} words=${totalWordCount} coverage=${coverageKnownPct}% unresolved=${unresolvedSurfaces.length}${unresolvedSurfaces.length ? ` [${unresolvedSurfaces.join(', ')}]` : ''}`,
  );

  return { paragraphs, glossary, newWords, coverageKnownPct, totalWordCount, translation, unresolvedSurfaces };
}
