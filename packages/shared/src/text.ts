const UMLAUT_FOLD: Record<string, string> = {
  ä: 'a',
  ö: 'o',
  ü: 'u',
};

/** Apply to all user text input before storing or comparing it. */
export function normalizeInput(s: string): string {
  return s.trim().normalize('NFC');
}

/**
 * Lookup key for German word forms: lowercase + umlaut/ß folded.
 * Used to both write WordForm.normalized and query it — never persisted as
 * the word itself, since folding is lossy (e.g. "Masse" and "Maße" collide).
 */
export function foldForLookup(s: string): string {
  return normalizeInput(s)
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[äöü]/g, (ch) => UMLAUT_FOLD[ch] ?? ch);
}
