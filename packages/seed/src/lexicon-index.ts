import type { PrismaClient } from '@wortgarten/database';
import {
  clauseFinalTokenIndices,
  foldForLookup,
  isFiniteVerbForm,
  rankLexemes,
  resolveSeparableSentence,
  tokenizeWithOffsets,
  type PartOfSpeech,
  type SentenceSlot,
} from '@wortgarten/shared';

export interface IndexedLexeme {
  id: string;
  lemma: string;
  partOfSpeech: PartOfSpeech;
  separablePrefix: string | null;
  frequencyRank: number | null;
}

export interface IndexedSense {
  id: string;
  lexemeId: string;
  translation: string;
}

export interface LexiconIndex {
  lexemesById: Map<string, IndexedLexeme>;
  sensesByLexemeId: Map<string, IndexedSense[]>;
  lexemeIdsByNormalized: Map<string, string[]>;
  lexemeIdsByExactSurface: Map<string, string[]>;
  // `${surface}|${lexemeId}` for every WordForm row whose own tags mark it a finite (conjugated)
  // reading — the separable-verb reassembly guard (`resolveSentence`) may only treat a base-verb
  // match as a reassembly trigger when it matched via a row that's actually in here; an
  // infinitive/participle/bare-lemma row never separates from its prefix, so it must never seed one.
  finiteFormKeys: Set<string>;
}

/** Loads the whole seeded dictionary into memory once — cheap at this scale (thousands of
 * lexemes, low hundred-thousands of forms) and turns per-token resolution during the examples
 * passes into a Map lookup instead of a per-token DB round trip. */
export async function loadLexiconIndex(prisma: PrismaClient, language: string): Promise<LexiconIndex> {
  const lexemes = await prisma.lexeme.findMany({
    where: { language },
    select: { id: true, lemma: true, partOfSpeech: true, separablePrefix: true, frequencyRank: true },
  });
  const lexemesById = new Map(lexemes.map((l) => [l.id, l]));

  const senses = await prisma.sense.findMany({
    where: { lexeme: { language } },
    select: { id: true, lexemeId: true, translation: true },
  });
  const sensesByLexemeId = new Map<string, IndexedSense[]>();
  for (const s of senses) {
    const arr = sensesByLexemeId.get(s.lexemeId) ?? [];
    arr.push(s);
    sensesByLexemeId.set(s.lexemeId, arr);
  }

  const forms = await prisma.wordForm.findMany({
    where: { lexeme: { language } },
    select: { normalized: true, surface: true, lexemeId: true, features: true },
  });
  const lexemeIdsByNormalized = new Map<string, string[]>();
  const lexemeIdsByExactSurface = new Map<string, string[]>();
  const finiteFormKeys = new Set<string>();
  for (const f of forms) {
    const arr = lexemeIdsByNormalized.get(f.normalized) ?? [];
    if (!arr.includes(f.lexemeId)) arr.push(f.lexemeId);
    lexemeIdsByNormalized.set(f.normalized, arr);

    const exactArr = lexemeIdsByExactSurface.get(f.surface) ?? [];
    if (!exactArr.includes(f.lexemeId)) exactArr.push(f.lexemeId);
    lexemeIdsByExactSurface.set(f.surface, exactArr);

    // Folded, not exact surface: capitalization (sentence-initial position, same as any other
    // word) carries no grammatical information, but WordForm.surface for a verb conjugation is
    // always stored lowercase — an exact-surface key would silently miss every sentence-initial
    // occurrence of a finite verb (e.g. "Atmen Sie ganz aus." — "Atmen" from a lowercase-stored "atmen" row).
    const raw = (f.features as { raw?: string[] } | null)?.raw;
    if (isFiniteVerbForm(raw)) finiteFormKeys.add(`${foldForLookup(f.surface)}|${f.lexemeId}`);
  }

  return { lexemesById, sensesByLexemeId, lexemeIdsByNormalized, lexemeIdsByExactSurface, finiteFormKeys };
}

export interface ResolvedSurface {
  lexeme: IndexedLexeme;
  senses: IndexedSense[];
}

/**
 * Ranked candidate lexemes for one surface, most-plausible first — same tokenizer/ranking
 * function as apps/api's `LookupService.lookupForm` (`@wortgarten/shared`'s `rankLexemes`).
 *
 * Deliberately simpler than the runtime service: no contraction resolution. This package must not
 * depend on apps/api (same reason the seed's other standalone reimplementations exist — see
 * verify.ts). Callers that need separable-verb reassembly across tokens should use
 * `resolveSentence` below, not this function directly.
 */
export function resolveSurface(index: LexiconIndex, surface: string, isSentenceStart: boolean): ResolvedSurface[] {
  // Folded lookup is intentional for typo-tolerant user input (umlaut-insensitive, same as
  // "fur"/"für"), but it also fold-collides distinct real spellings onto the same key — e.g.
  // "Banken" (financial-institution plural) and "Bänken" (dative plural of the unrelated "bench"
  // homograph lexeme) both fold to "banken". A real corpus sentence is exactly spelled, so an
  // exact WordForm.surface match — when one exists — is strictly better evidence than a folded
  // one and must win outright, not just get a ranking nudge (rankLexemes has no way to know which
  // of its candidates came from folding vs. an exact spelling).
  const exactLexemeIds = index.lexemeIdsByExactSurface.get(surface);
  const lexemeIds = exactLexemeIds && exactLexemeIds.length > 0 ? exactLexemeIds : (index.lexemeIdsByNormalized.get(foldForLookup(surface)) ?? []);
  const matches = lexemeIds.map((id) => ({
    lexeme: index.lexemesById.get(id)!,
    senses: index.sensesByLexemeId.get(id) ?? [],
  }));
  return rankLexemes(matches, { surface, isSentenceStart });
}

type SeparableResolvedSurface = ResolvedSurface & { isFiniteForm: boolean };

/**
 * Resolves every token of a real sentence, reassembling German separable verbs into one slot —
 * the same `resolveSeparableSentence` algorithm (`@wortgarten/shared`) `LookupService` uses at
 * runtime, applied here offline so `seed:index` attributes a split separable verb's sentence to
 * the ONE lexeme it's actually about (e.g. "Ich rufe dich an." → `anrufen`, not `rufen` + the
 * preposition `an` separately). A merged slot's `matches` array always has exactly one entry — see
 * `resolveSeparableSentence` — so the caller never has to re-disambiguate lexeme identity for it.
 */
export function resolveSentence(index: LexiconIndex, text: string): Promise<SentenceSlot<SeparableResolvedSurface>[]> {
  const spans = tokenizeWithOffsets(text);
  const tokens = spans.map((s) => s.token);
  const clauseFinal = clauseFinalTokenIndices(text, spans);

  const resolve = (token: string, i: number): SeparableResolvedSurface[] =>
    resolveSurface(index, token, i === 0).map((m) => ({ ...m, isFiniteForm: index.finiteFormKeys.has(`${foldForLookup(token)}|${m.lexeme.id}`) }));

  return resolveSeparableSentence(tokens, resolve, clauseFinal);
}
