import type { Story, StoryParagraph, StoryToken } from '@wortgarten/shared';
import type { ReaderFontSize } from './ReaderTopBar';

const FONT_SIZE_CLASSES: Record<ReaderFontSize, string> = {
  S: 'text-base leading-relaxed',
  M: 'text-lg leading-relaxed',
  L: 'text-xl leading-loose',
};

interface StoryBodyProps {
  story: Story;
  fontSize: ReaderFontSize;
  onTapWord: (token: StoryToken, paragraph: StoryParagraph) => void;
}

/** Renders pre-resolved tokens verbatim — no tokenization/lemmatization happens here, ever. Every
 * word token is just a lookup: its own `status` decides styling, `lexemeId` keys the popup content. */
export function StoryBody({ story, fontSize, onTapWord }: StoryBodyProps) {
  return (
    <div className={`flex flex-col gap-4 text-ink ${FONT_SIZE_CLASSES[fontSize]}`}>
      {story.paragraphs.map((paragraph, pIndex) => (
        <p key={pIndex}>
          {paragraph.tokens.map((token, tIndex) => {
            if (token.kind !== 'word') {
              return <span key={tIndex}>{token.text}</span>;
            }

            if (token.status === 'unknown' && !token.lexemeId) {
              // A word the resolver couldn't place at all (hallucination/typo/unhandled
              // inflection) — an ordinary comprehensible-input gap, not the learner's mistake.
              // Plain text: no color, no popup, no tap.
              return <span key={tIndex}>{token.text}</span>;
            }

            // 'unknown' here always carries a real lexemeId (the branch above caught the null
            // case) — a real word just outside this user's allowlist, rendered exactly like 'new'.
            const isAccented = token.status === 'new' || token.status === 'unknown';

            return (
              <button
                key={tIndex}
                type="button"
                onClick={() => onTapWord(token, paragraph)}
                className={`rounded px-0.5 -mx-0.5 transition-colors hover:bg-teal-soft ${
                  isAccented ? 'font-semibold text-ink underline decoration-2 decoration-yellow underline-offset-4' : ''
                }`}
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
