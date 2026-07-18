// DI tokens for values/interfaces that aren't Nest classes (primitives, interfaces erased at
// runtime) — the concrete classes (GroqAdapter, OllamaAdapter, PrismaService) are their own tokens.
export const AI_QUOTA_STORE = 'AI_QUOTA_STORE';
export const CLOCK = 'CLOCK';
