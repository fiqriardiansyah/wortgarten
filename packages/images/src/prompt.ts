import { createHash } from 'crypto';

/** The one editable style constant — restyle the entire cover library by editing this string.
 * Only `{subject}` and `{accent}` vary per story. The "no text/lettering/words/letters" line is
 * load-bearing: image models render garbled pseudo-text, which looks especially broken in a
 * language-learning app. Never remove it. */
export const STORY_COVER_PROMPT_TEMPLATE = `Flat hand-drawn line illustration of {subject}.
Style: single-weight wobbly ink outline, as if sketched with a fine marker — lines
slightly uneven and imperfect, with a gentle double-stroke quality where the pen
went over the line twice. Simple, friendly, minimal shapes. No gradients, no 3D,
no realistic shading, no drop shadows.
Palette ONLY: dark ink #1F2937 for all outlines, {accent} as the single accent
fill, plain white background. Mostly white with sparing accent fills. A few small
scattered confetti dots and tiny sparkle marks around the subject.
Cheerful, warm, notebook-doodle feeling. Modern educational app illustration.
Very wide horizontal banner composition, subject centered small with generous
empty white space on both sides.
No text, no lettering, no words, no letters, no frame, no border.`;

const MAX_SUBJECT_LENGTH = 120;

// Real v2 sketch-theme tokens only (apps/web/src/design/tokens.ts `color.teal` / `color.yellow`).
// The spec's original purple/orange/green/gold list is the retired v1 palette — coral is reserved
// for danger/wrong-answer everywhere else in the app and is deliberately excluded here too.
export const ACCENT_COLORS = ['#2BB3A3', '#FFD029'] as const;

/** First 1-2 sentences of the story's English translation, trailing punctuation stripped, capped
 * at ~120 chars — a long subject fights the prompt's composition instruction and produces
 * cluttered images, so this deliberately does not pass the whole translation through. */
export function buildSubject(translation: string): string {
  const trimmed = translation.trim();
  const sentenceMatch = trimmed.match(/^(.+?[.!?])\s+(.+?[.!?])(?:\s|$)/);
  const firstTwo = sentenceMatch ? `${sentenceMatch[1]} ${sentenceMatch[2]}` : trimmed;
  const firstOne = trimmed.match(/^.+?[.!?]/)?.[0] ?? trimmed;

  const subject = firstTwo.length <= MAX_SUBJECT_LENGTH ? firstTwo : firstOne;
  const stripped = subject.replace(/[.!?\s]+$/, '');
  return stripped.length <= MAX_SUBJECT_LENGTH ? stripped : stripped.slice(0, MAX_SUBJECT_LENGTH).trim();
}

/** Deterministic so the same story always renders with the same accent — a hash of `storyId`
 * rather than randomness, so re-rendering the library never flickers between colors. */
export function pickAccent(storyId: string): string {
  const hash = createHash('sha256').update(storyId).digest();
  const index = hash[0] % ACCENT_COLORS.length;
  return ACCENT_COLORS[index];
}

export function buildCoverPrompt({ subject, accent }: { subject: string; accent: string }): string {
  return STORY_COVER_PROMPT_TEMPLATE.replace('{subject}', subject).replace('{accent}', accent);
}
