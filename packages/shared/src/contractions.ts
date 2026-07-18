import { foldForLookup } from './text';

// Fused preposition + article — not something a learner should collect. The token resolves to the
// base preposition instead (e.g. "im" → "in"), the same as any other inflected form would.
const RAW_CONTRACTIONS: Record<string, string> = {
  im: 'in',
  am: 'an',
  zum: 'zu',
  zur: 'zu',
  beim: 'bei',
  vom: 'von',
  ins: 'in',
  ans: 'an',
  aufs: 'auf',
  fürs: 'für',
  durchs: 'durch',
  ums: 'um',
};

const CONTRACTIONS = new Map(Object.entries(RAW_CONTRACTIONS).map(([surface, base]) => [foldForLookup(surface), base]));

/** Returns the base preposition a contraction stands for (folded-key lookup), or undefined if `surface` isn't one. */
export function resolveContraction(surface: string): string | undefined {
  return CONTRACTIONS.get(foldForLookup(surface));
}
