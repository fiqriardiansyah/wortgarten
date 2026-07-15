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

const UMLAUT_FOLD_PRESERVE_CASE: Record<string, string> = { ä: 'a', ö: 'o', ü: 'u', Ä: 'A', Ö: 'O', Ü: 'U' };

/**
 * Folds ONLY ä/ö/ü/ß — case is preserved. Used to detect specifically an umlaut/ß
 * difference (e.g. "schon" vs "schön") without also matching a plain-case typo
 * ("hund" vs "Hund"), which `foldForLookup`'s combined lowercase+fold would conflate.
 */
export function foldUmlautsOnly(s: string): string {
  return normalizeInput(s)
    .replace(/ß/g, 'ss')
    .replace(/[äöüÄÖÜ]/g, (ch) => UMLAUT_FOLD_PRESERVE_CASE[ch] ?? ch);
}
