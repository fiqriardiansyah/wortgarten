import type { Story, StoryParagraph, StoryToken } from '@wortgarten/shared';
import type { ReaderFontSize } from './ReaderTopBar';
import { TokenSpan } from './TokenSpan';

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

            return (
              <TokenSpan
                key={tIndex}
                token={token}
                isActive={isActive}
                registerRef={isScrollAnchor ? registerActiveRef : undefined}
                onTap={(tapped) => onTapWord(tapped, paragraph)}
              />
            );
          })}
        </p>
      ))}
    </div>
  );
}
