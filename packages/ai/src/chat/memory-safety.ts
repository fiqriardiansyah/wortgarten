import { CHAT_MEMORY_MAX_FACTS } from '@wortgarten/shared';

// A fact/sentence this long is more likely to be leaking detail than stating a short preference
// ("likes cats", "found the dative tricky") — a length valve on top of the keyword deny list.
const MAX_FACT_LENGTH = 140;

// Bare-keyword, NOT phrase-anchored — deliberately over-broad, per the spec's "if in doubt, drop
// it" rule: a false positive (an innocent fact dropped) is the acceptable failure mode, a false
// negative (an identifying detail kept) is not. Earlier phrasing-specific patterns here (e.g.
// requiring literal "my name is") were live-verified to MISS real leaks: the night summariser
// naturally writes in third person about the learner ("Sarah is the learner's name", "Chicago is
// their hometown"), which a first-person-anchored pattern never matches. A bare keyword catches
// the concept regardless of who's speaking or which grammatical person is used. Never treat this
// as exhaustive; it's the plain-code half of a two-layer defense, the other half being the night
// summariser's own prompt instructions (see prompts.ts's memoryPrompt).
const DENY_PATTERNS: RegExp[] = [
  // Contact / identifying handles.
  /@/, // email addresses, @handles
  /\bhttps?:\/\//i,
  /\d{3,}/, // phone numbers, street numbers, zip/postal codes, birth years, etc.
  // Real name.
  /\bname[ds]?\b|\bcalled\b|\bnamed\b/i, // "name"/"named"/"called X" — any phrasing, any person
  /\bsurname\b|\bnickname\b/i,
  // Location / institution.
  /\baddress\b|\bstreet\b|\bpostal\b|\bzip\s?code\b/i,
  /\b(?:home\s?town|city|town|country|neighbou?rhood|lives?|lived|living|from)\b/i,
  /\bschool\b|\buniversity\b|\bcollege\b|\bemployer\b|\bworkplace\b|\bcompany\b|\bjob\b/i,
  // Contact fields.
  /\bphone\b|\btelephone\b|\bmobile\b|\be-?mail\b/i,
  // Age / birthday.
  /\bbirthday\b|\bborn\b|\bage\b|\byears?[\s-]old\b/i,
  // Health / family / financial.
  /\bmedical\b|\bdiagnos|\billness\b|\bdisease\b|\btherapy\b|\bmedication\b/i,
  /\b(?:mother|father|mom|dad|sister|brother|parents?|family)\b/i,
  /\bsalary\b|\bbank\b|\bcredit card\b|\bsocial security\b|\bpassword\b/i,
  // Secrecy / meeting up — never remembered even as a "topic".
  /\bsecret\b|\bdon'?t tell\b|\bkeep.{0,15}between us\b/i,
  /\bmeet.{0,20}person\b|\bcome over\b|\bmy place\b/i,
];

/** True if `text` contains none of the denied categories — the core check shared by facts and
 * summary sentences alike. Pure, synchronous, no DB. */
export function hasNoDeniedContent(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return !DENY_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** True if `text` is safe to keep as a standalone memory FACT — the deny list plus a length
 * valve (a short atomic claim this long is more likely leaking detail than stating a
 * preference). Summary sentences are checked separately, without the length cap — see
 * `sanitizeSummary`, which allows an ordinary-length narrative sentence. */
export function isFactSafe(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length <= MAX_FACT_LENGTH && hasNoDeniedContent(trimmed);
}

/** Applies `isFactSafe` to a candidate fact list and caps it at `CHAT_MEMORY_MAX_FACTS` — the
 * night summariser is asked to keep facts capped already, but this is the enforcement layer that
 * actually matters (see the spec's "both the night summariser and the plain-code checker" rule). */
export function filterSafeFacts(candidates: string[], maxFacts = CHAT_MEMORY_MAX_FACTS): string[] {
  const kept: string[] = [];
  for (const raw of candidates) {
    const text = raw.trim();
    if (!isFactSafe(text)) continue;
    kept.push(text);
    if (kept.length >= maxFacts) break;
  }
  return kept;
}

/** Same deny list, applied sentence-by-sentence to the running summary paragraph — an identifying
 * detail must never survive into `summary` any more than into `facts`. A dropped sentence just
 * isn't part of the summary; nothing here ever blocks the whole note from saving. */
export function sanitizeSummary(summary: string): string {
  const sentences = summary
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.filter(hasNoDeniedContent).join(' ');
}
