import type { StoryToken } from '@wortgarten/shared';

interface TokenSpanProps {
  token: StoryToken;
  isActive?: boolean;
  registerRef?: (el: HTMLElement | null) => void;
  onTap: (token: StoryToken) => void;
}

/** One resolved token, rendered exactly the same way everywhere it appears — the Reader's
 * StoryBody and Story Chat's MessageBubble both hang off this so a highlight/tap/accent rule
 * never drifts between the two screens. Renders pre-resolved tokens verbatim — no
 * tokenization/lemmatization happens here, ever. */
export function TokenSpan({ token, isActive, registerRef, onTap }: TokenSpanProps) {
  // Primary teal, never coral — a confident follow-along, not an alert (see design tokens).
  const highlightClass = isActive ? 'bg-teal text-white' : '';

  if (token.kind !== 'word') {
    return (
      <span ref={registerRef} className={`rounded ${highlightClass}`}>
        {token.text}
      </span>
    );
  }

  if (token.status === 'unknown' && !token.lexemeId) {
    // A word the resolver couldn't place at all (hallucination/typo/unhandled inflection) — an
    // ordinary comprehensible-input gap, not the learner's mistake. Plain text: no tap.
    return (
      <span ref={registerRef} className={`rounded ${highlightClass}`}>
        {token.text}
      </span>
    );
  }

  const isAccented = token.status === 'new' || token.status === 'unknown';
  // `text-white`/`text-ink` are equal-specificity utilities — never let both land on the same
  // element (Tailwind's generated order, not this file's class order, would decide the winner).
  const textColorClass = isActive ? 'text-white' : isAccented ? 'text-ink' : '';
  const accentClass = isAccented ? 'font-semibold underline decoration-2 decoration-yellow underline-offset-4' : '';

  return (
    <button
      type="button"
      ref={registerRef}
      onClick={() => onTap(token)}
      className={`rounded px-0.5 -mx-0.5 transition-colors hover:bg-teal-soft ${highlightClass} ${textColorClass} ${accentClass}`}
    >
      {token.text}
    </button>
  );
}
