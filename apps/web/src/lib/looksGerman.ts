const GERMAN_CHARS = /[äöüßÄÖÜ]/;

/**
 * A cheap, deterministic hint only — never gates the analysis itself. German
 * capitalizes every noun, so a capitalized word that isn't the first word of
 * its own sentence is a strong tell; umlauts/ß are another. Text with neither
 * signal (and nothing but ASCII) is worth a gentle "this looks like English"
 * nudge when every token came back unrecognized.
 */
export function suggestsNonGermanText(text: string): boolean {
  if (GERMAN_CHARS.test(text)) return false;
  if (/[^\x00-\x7F]/.test(text)) return false; // any other non-ASCII char — don't guess

  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    for (let i = 1; i < words.length; i++) {
      if (/^[A-ZÄÖÜ]/.test(words[i])) return false; // capitalized interior word — looks German
    }
  }
  return true;
}
