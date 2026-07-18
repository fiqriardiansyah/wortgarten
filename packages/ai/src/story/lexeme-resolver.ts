import type { Lexeme, PrismaClient, Sense, WordForm } from '@wortgarten/database';
import {
  clauseFinalTokenIndices,
  foldForLookup,
  isFiniteVerbForm,
  rankLexemes,
  resolveContraction,
  resolveSeparableSentence,
  tokenize,
  tokenizeWithOffsets,
} from '@wortgarten/shared';

export interface LexemeMatch {
  lexeme: Lexeme;
  form: WordForm;
  senses: Sense[];
}

export interface SentenceTokenMatch {
  tokens: string[];
  tokenIndices: number[];
  matches: LexemeMatch[];
  unknown: boolean;
}

type SeparableLexemeMatch = LexemeMatch & { isFiniteForm: boolean };

/**
 * A small, deliberate duplicate of apps/api's LookupService (same tokenize → resolve →
 * reassemble-separable-verbs → rank pipeline, same @wortgarten/shared primitives), minus
 * `disambiguate` (not needed here — the story checker/builder already have a stronger signal
 * than "does the user own this sense": the explicit vocabulary allowlist). It is NOT imported
 * from apps/api directly: that class is wired to apps/api's own Nest-injected PrismaService, and
 * this package is consumed by apps/worker (Nest v10) and apps/api (Nest v11) alike — same
 * cross-app-boundary reasoning documented on GroqAdapter/OllamaAdapter for reading `process.env`
 * directly rather than injecting `ConfigService`. Takes a plain `PrismaClient`, not a specific
 * app's PrismaService class, so either app's own connection can be passed in directly.
 */
export class LexemeResolver {
  constructor(private readonly prisma: PrismaClient) {}

  async lookupForm(surface: string, language = 'de', isSentenceStart = false): Promise<LexemeMatch[]> {
    const effectiveSurface = resolveContraction(surface) ?? surface;
    const normalized = foldForLookup(effectiveSurface);
    const forms = await this.prisma.wordForm.findMany({
      where: { normalized, lexeme: { language } },
      include: { lexeme: { include: { senses: true } } },
    });

    const matches = forms.map(({ lexeme, ...form }) => ({ lexeme, form, senses: lexeme.senses }));
    return rankLexemes(matches, { surface: effectiveSurface, isSentenceStart });
  }

  async lookupSentence(text: string, language = 'de'): Promise<SentenceTokenMatch[]> {
    const tokens = tokenize(text);
    const clauseFinalIndices = clauseFinalTokenIndices(text, tokenizeWithOffsets(text));

    const resolve = async (token: string, index: number): Promise<SeparableLexemeMatch[]> => {
      const matches = await this.lookupForm(token, language, index === 0);
      return matches.map((m) => ({ ...m, isFiniteForm: isFiniteVerbForm((m.form.features as { raw?: string[] } | null)?.raw) }));
    };

    const slots = await resolveSeparableSentence(tokens, resolve, clauseFinalIndices);
    return slots.map((s) => ({ tokens: s.tokens, tokenIndices: s.tokenIndices, matches: s.matches, unknown: s.unknown }));
  }
}
