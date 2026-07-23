import type { Story, StoryParagraph, StoryToken } from '@wortgarten/shared';
import type { ReaderFontSize } from './ReaderTopBar';

const FONT_SIZE_CLASSES: Record<ReaderFontSize, string> = {
  S: 'text-base leading-relaxed',
  M: 'text-lg leading-relaxed',
  L: 'text-xl leading-loose',
};

export interface ActiveTokenPosition {
  paragraphIndex: number;
  tokenIndex: number;
}

export interface ActiveSentencePosition {
  paragraphIndex: number;
  startTokenIndex: number;
  endTokenIndex: number;
}

interface StoryBodyProps {
  story: Story;
  fontSize: ReaderFontSize;
  onTapWord: (token: StoryToken, paragraph: StoryParagraph) => void;
  /** Listen Mode's current word (wordLevel sync) — null whenever Listen Mode isn't playing, has no
   * audio, or is in sentenceLevel fallback. */
  activeToken?: ActiveTokenPosition | null;
  /** Listen Mode's current sentence (sentenceLevel fallback) — null otherwise. */
  activeSentence?: ActiveSentencePosition | null;
  /** Attached to whichever token is the current karaoke "anchor" (the active word, or the first
   * token of the active sentence) so `ReaderPage` can smooth-scroll it into view. Only ever
   * attached to at most one token at a time. */
  registerActiveRef?: (el: HTMLElement | null) => void;
}

/** Renders pre-resolved tokens verbatim — no tokenization/lemmatization happens here, ever. Every
 * word token is just a lookup: its own `status` decides styling, `lexemeId` keys the popup content. */
export function StoryBody({ story, fontSize, onTapWord, activeToken, activeSentence, registerActiveRef }: StoryBodyProps) {
  return (
    <div className={`flex flex-col gap-4 text-ink ${FONT_SIZE_CLASSES[fontSize]}`}>
      {story.paragraphs.map((paragraph, pIndex) => (
        <p key={pIndex}>
          {paragraph.tokens.map((token, tIndex) => {
            const isActiveWord = activeToken?.paragraphIndex === pIndex && activeToken.tokenIndex === tIndex;
            const isInActiveSentence =
              activeSentence?.paragraphIndex === pIndex && tIndex >= activeSentence.startTokenIndex && tIndex <= activeSentence.endTokenIndex;
            const isActive = isActiveWord || isInActiveSentence;
            const isScrollAnchor = isActiveWord || (isInActiveSentence && tIndex === activeSentence?.startTokenIndex);
            const anchorRef = isScrollAnchor ? registerActiveRef : undefined;
            // Primary teal, never coral — a confident follow-along, not an alert (see design tokens).
            const highlightClass = isActive ? 'bg-teal text-white' : '';

            if (token.kind !== 'word') {
              return (
                <span key={tIndex} ref={anchorRef} className={`rounded ${highlightClass}`}>
                  {token.text}
                </span>
              );
            }

            if (token.status === 'unknown' && !token.lexemeId) {
              // A word the resolver couldn't place at all (hallucination/typo/unhandled
              // inflection) — an ordinary comprehensible-input gap, not the learner's mistake.
              // Plain text: no color, no popup, no tap.
              return (
                <span key={tIndex} ref={anchorRef} className={`rounded ${highlightClass}`}>
                  {token.text}
                </span>
              );
            }

            // 'unknown' here always carries a real lexemeId (the branch above caught the null
            // case) — a real word just outside this user's allowlist, rendered exactly like 'new'.
            const isAccented = token.status === 'new' || token.status === 'unknown';
            // `text-white`/`text-ink` are equal-specificity utilities — never let both land on the
            // same element (Tailwind's generated order, not this file's class order, would decide
            // the winner). Active always wins over the accent color.
            const textColorClass = isActive ? 'text-white' : isAccented ? 'text-ink' : '';
            const accentClass = isAccented ? 'font-semibold underline decoration-2 decoration-yellow underline-offset-4' : '';

            return (
              <button
                key={tIndex}
                ref={anchorRef}
                type="button"
                onClick={() => onTapWord(token, paragraph)}
                className={`rounded px-0.5 -mx-0.5 transition-colors hover:bg-teal-soft ${highlightClass} ${textColorClass} ${accentClass}`}
              >
                {token.text}
              </button>
            );
          })}
        </p>
      ))}
    </div>
  );
}
