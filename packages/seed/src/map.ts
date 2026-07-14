import crypto from 'crypto';
import { foldForLookup } from '@wortgarten/shared';
import type { Gender, PartOfSpeech } from '@wortgarten/database';
import { categoryName, type KaikkiEntry, type KaikkiForm } from './types';

// ─── Part of speech ─────────────────────────────────────────────────────────

const POS_MAP: Record<string, PartOfSpeech> = {
  noun: 'NOUN',
  verb: 'VERB',
  adj: 'ADJECTIVE',
  adv: 'ADVERB',
  pron: 'PRONOUN',
  prep: 'PREPOSITION',
  postp: 'PREPOSITION',
  conj: 'CONJUNCTION',
  article: 'ARTICLE',
  det: 'ARTICLE',
  num: 'NUMERAL',
  particle: 'PARTICLE',
};

// Dropped in Pass 1 — not words a learner adds to a bank.
export const REJECT_POS = new Set([
  'name',
  'phrase',
  'proverb',
  'character',
  'punct',
  'abbrev',
  'prefix',
  'suffix',
  'infix',
  'romanization',
]);

export function isRejectedPos(pos: string): boolean {
  return REJECT_POS.has(pos);
}

export function mapPos(pos: string): PartOfSpeech {
  return POS_MAP[pos] ?? 'OTHER';
}

export function isArchaic(entry: KaikkiEntry): boolean {
  return entry.tags.some((t) => t === 'archaic' || t === 'obsolete');
}

// ─── form_of (inflected-form-only entries) ─────────────────────────────────

/** kaikki emits standalone entries for inflected forms; `form_of` on a sense is the reliable marker. Not a lemma — never scored or imported as a Lexeme. */
export function formOfTargets(entry: KaikkiEntry): string[] {
  const targets = new Set<string>();
  for (const sense of entry.senses) {
    for (const fo of sense.form_of) targets.add(fo.word);
  }
  return [...targets];
}

// A form_of target is only ever read from this structured field — never inferred from gloss
// prose. But the field itself isn't always trustworthy: kaikki's own extraction can mis-parse a
// sense's English gloss text into a bogus form_of entry (verified live: "sich"'s first sense,
// glossed "Reflexive pronoun of the third person singular or plural: herself, himself, ...",
// produced a form_of target of literally "the third person singular or plural" — not a German
// word, not an entry anywhere in the dump). A word can't be a form of itself either. Filtering to
// targets that are BOTH a different word AND a real lemma that exists in the dump (`lemmaSet`,
// built from every entry.word in the filtered kaikki stream) rejects exactly these mis-parses
// without ever reading prose — "sich" then imports as a normal lemma instead of being dropped.
export function validFormOfTargets(entry: KaikkiEntry, lemmaSet: ReadonlySet<string>): string[] {
  return formOfTargets(entry).filter((t) => t !== entry.word && lemmaSet.has(t));
}

export function isFormOfEntry(entry: KaikkiEntry, lemmaSet: ReadonlySet<string>): boolean {
  return validFormOfTargets(entry, lemmaSet).length > 0;
}

// ─── Lexeme identity ────────────────────────────────────────────────────────

export interface LexemeIdentity {
  lemma: string;
  pos: PartOfSpeech;
  gender?: Gender | null;
  plural?: string | null;
  separablePrefix?: string | null;
  auxiliary?: string | null;
  pastParticiple?: string | null;
}

// One Lexeme per distinct German *word*, not per spelling. kaikki emits a
// separate top-level entry per etymology section, so `lemma + pos + gender`
// alone conflates real homographs that share a gender but differ in every
// other way that matters (die Bank the bench / die Bank the financial
// institution — same gender, different plural). This key is built from
// whichever grammatical facts actually distinguish a word for its part of
// speech; etymologyNumber is deliberately NOT part of it.
//
// This also *is* the merge guard: two kaikki entries with different etymology
// numbers but identical core fields (same gender, same plural, same principal
// parts) collapse onto the same key and land on the same Lexeme automatically
// — kaikki's etymology split is respected only when it coincides with an
// actual grammatical difference, never on its own.
export function lexemeCoreKey(id: LexemeIdentity): string {
  switch (id.pos) {
    case 'NOUN':
      return ['NOUN', id.lemma, id.gender ?? '', id.plural ?? ''].join('|');
    case 'VERB':
      return ['VERB', id.lemma, id.auxiliary ?? '', id.separablePrefix ?? '', id.pastParticiple ?? ''].join('|');
    default:
      return [id.pos, id.lemma].join('|');
  }
}

// Re-seeding must never mint a new id for a word that already exists, or every
// UserWord (which points at a senseId) and Attempt gets orphaned. Both id and
// its source key are derived purely from content, so the same word always
// lands on the same row across runs.
export function contentId(sourceKey: string): string {
  return crypto.createHash('sha256').update(sourceKey).digest('hex').slice(0, 24);
}

export function lexemeSourceKey(language: string, id: LexemeIdentity): string {
  return `${language}|${lexemeCoreKey(id)}`;
}

/** Collapses whitespace/case so a gloss re-flowed by a future Wiktionary edit doesn't spuriously
 * change the sense id — while an actual wording change still does (that's the intended orphaning). */
export function normalizeGloss(gloss: string): string {
  return gloss.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function senseSourceKey(lexemeId: string, gloss: string, occurrence: number): string {
  const base = `${lexemeId}|${normalizeGloss(gloss)}`;
  return occurrence === 0 ? base : `${base}#${occurrence}`;
}

// ─── Gender ─────────────────────────────────────────────────────────────────

const GENDER_TAGS: Record<string, Gender> = {
  masculine: 'MASCULINE',
  feminine: 'FEMININE',
  neuter: 'NEUTER',
};
const GENDER_CODES: Record<string, Gender> = { m: 'MASCULINE', f: 'FEMININE', n: 'NEUTER' };

export function extractGender(entry: KaikkiEntry, pos: PartOfSpeech): Gender | undefined {
  if (pos !== 'NOUN') return undefined;

  for (const t of entry.tags) {
    if (t in GENDER_TAGS) return GENDER_TAGS[t];
  }
  for (const ht of entry.head_templates) {
    const g = ht.args?.g;
    if (typeof g === 'string' && g in GENDER_CODES) return GENDER_CODES[g];

    // Real de-noun head_templates pack gender as the leading segment of
    // positional arg "1" (verified against real data): "m,es:s,e" (Hund),
    // "f" (Frau), "n,,^er" (Haus) — comma-delimited for regular nouns, but
    // "n.sg" (Sein, Du — no-plural nouns) uses a dot instead. A word with more
    // than one valid declension pattern (verified: 3,477 real entries) packs
    // them colon-separated — "m:n,s,-" (Kiefer, jaw) is still masculine, the
    // colon just introduces the alternate declension, not a second gender.
    // There's no separate "g" key in practice.
    const arg1 = ht.args?.['1'];
    if (typeof arg1 === 'string') {
      const code = arg1.split(/[,.:]/)[0].trim().toLowerCase();
      if (code in GENDER_CODES) return GENDER_CODES[code];
    }
  }
  return undefined;
}

// ─── Plural ─────────────────────────────────────────────────────────────────

export function extractPlural(entry: KaikkiEntry, pos: PartOfSpeech): string | undefined {
  if (pos !== 'NOUN') return undefined;

  const pluralForms = entry.forms.filter((f) => f.form !== '-' && f.tags.includes('plural'));
  if (pluralForms.length === 0) return undefined;

  const nominative = pluralForms.find((f) => f.tags.includes('nominative'));
  const noCase = pluralForms.find((f) => !f.tags.some((t) => CASE_TAGS.has(t)) || f.tags.includes('nominative'));
  return (nominative ?? noCase ?? pluralForms[0]).form;
}

const CASE_TAGS = new Set(['nominative', 'accusative', 'dative', 'genitive']);

// ─── Separable verbs ────────────────────────────────────────────────────────

// Sorted longest-first so e.g. "hinauf" wins over "hin" when both would match.
// "um"/"durch"/"über"/"unter"/"wider"/"voll" deliberately excluded — dual
// prefixes that are separable in one sense and inseparable in another
// (umfahren, durchschauen, …); guessing wrong is worse than leaving null.
const SEPARABLE_PREFIXES = [
  'auseinander', 'entgegen', 'zusammen', 'hinunter', 'herunter', 'zurecht',
  'entlang', 'heraus', 'herein', 'herauf', 'hervor', 'herbei', 'herüber',
  'herum', 'hinüber', 'hinweg', 'hinzu', 'hinauf', 'hinaus', 'hinein',
  'voraus', 'vorbei', 'voran', 'vorüber', 'weiter', 'gegenüber', 'nieder',
  'empor', 'fest', 'fort', 'gleich', 'heim', 'statt', 'teil', 'wieder',
  'zurück', 'ab', 'an', 'auf', 'aus', 'bei', 'da', 'dar', 'ein', 'fern',
  'her', 'hin', 'los', 'mit', 'nach', 'vor', 'weg', 'zu',
].sort((a, b) => b.length - a.length);
const SEPARABLE_PREFIX_SET = new Set(SEPARABLE_PREFIXES);

// Real data has no "separable" tag/category at all (verified: e.g. anrufen's
// tags are [] and its categories never say "separable"). The actual signal
// Wiktionary provides is a "German terms prefixed with X-" category, which
// names *any* prefix (separable or not, e.g. "ver-", "be-") — cross-check the
// extracted prefix against SEPARABLE_PREFIXES to decide separability, rather
// than gating on a signal that doesn't exist in the real dump.
const PREFIX_CATEGORY_PATTERN = /German terms prefixed with ([a-zäöüß]+)-/i;

function categoryPrefix(entry: KaikkiEntry): string | undefined {
  for (const c of entry.categories) {
    const m = categoryName(c).match(PREFIX_CATEGORY_PATTERN);
    if (m) return m[1].toLowerCase();
  }
  return undefined;
}

// "um"/"durch"/"über"/"unter"/"wider"/"voll" are excluded from SEPARABLE_PREFIXES
// because they're dual-behavior (separable in one verb, inseparable in another) —
// but a genuine two-word present/preterite conjugated form in THIS entry's own
// table ("fährt um", not the periphrastic-perfect "haben umgefahren") is direct,
// entry-specific proof of separability, not a spelling guess. (umfahren: the
// inseparable etymology has zero such forms; the separable one has dozens.)
function conjugatedSeparableEvidence(entry: KaikkiEntry, prefix: string): boolean {
  const lowerPrefix = prefix.toLowerCase();
  return entry.forms.some((f) => {
    if (f.tags.includes('multiword-construction')) return false;
    const parts = f.form.split(' ');
    return parts.length === 2 && parts[1].toLowerCase() === lowerPrefix;
  });
}

export function extractSeparablePrefix(entry: KaikkiEntry, pos: PartOfSpeech): string | undefined {
  if (pos !== 'VERB') return undefined;

  const explicit = entry.forms.find((f) => f.tags.includes('separable') || f.tags.includes('prefix'));
  if (explicit) return explicit.form;

  const catPrefix = categoryPrefix(entry);
  if (catPrefix) {
    if (SEPARABLE_PREFIX_SET.has(catPrefix)) return catPrefix;
    // A "prefixed with X-" category where X isn't a known-always-separable
    // prefix (e.g. "ver-", or a dual-behavior one like "um-") is ambiguous on
    // its own — check this entry's own conjugation table before giving up.
    return conjugatedSeparableEvidence(entry, catPrefix) ? catPrefix : undefined;
  }

  // No prefix category at all — last-resort fallback on the lemma's own spelling.
  const word = entry.word.toLowerCase();
  for (const prefix of SEPARABLE_PREFIXES) {
    if (!word.startsWith(prefix)) continue;
    const remainder = word.slice(prefix.length);
    if (remainder.length >= 2 && /(en|ln|rn|n)$/.test(remainder)) return prefix;
  }
  return undefined;
}

// ─── Past participle (verb identity discriminator) ─────────────────────────

export function extractPastParticiple(entry: KaikkiEntry, pos: PartOfSpeech): string | undefined {
  if (pos !== 'VERB') return undefined;
  return entry.forms.find((f) => f.tags.includes('participle') && f.tags.includes('past'))?.form;
}

// ─── Auxiliary ──────────────────────────────────────────────────────────────

export function extractAuxiliary(entry: KaikkiEntry, pos: PartOfSpeech): string | undefined {
  if (pos !== 'VERB') return undefined;

  // Most reliable signal: kaikki's conjugation-table extraction emits a
  // dedicated `{form: "haben"|"sein", tags: ["auxiliary"]}` row (verified
  // against real data — e.g. "scheren"). These rows are filtered out of
  // collectSurfaceForms (they're metadata, not real inflected forms), so
  // read them here before that filtering happens.
  const auxForms = new Set(
    entry.forms.filter((f) => f.tags.includes('auxiliary')).map((f) => f.form.toLowerCase()),
  );
  if (auxForms.has('haben') && auxForms.has('sein')) return 'haben/sein';
  if (auxForms.has('haben')) return 'haben';
  if (auxForms.has('sein')) return 'sein';

  for (const ht of entry.head_templates) {
    const aux = ht.args?.aux ?? ht.args?.auxiliary;
    if (typeof aux === 'string') {
      const hasHaben = aux.includes('haben');
      const hasSein = aux.includes('sein');
      if (hasHaben && hasSein) return 'haben/sein';
      if (hasHaben) return 'haben';
      if (hasSein) return 'sein';
    }
  }

  const hasHabenCat = entry.categories.some((c) => /haben.*auxiliary|auxiliary.*haben/i.test(categoryName(c)));
  const hasSeinCat = entry.categories.some((c) => /sein.*auxiliary|auxiliary.*sein/i.test(categoryName(c)));
  if (hasHabenCat && hasSeinCat) return 'haben/sein';
  if (hasHabenCat) return 'haben';
  if (hasSeinCat) return 'sein';
  return undefined;
}

// ─── Government (preposition + case) — best-effort, nullable ──────────────

const CASE_PATTERN = /\(?\+?\s*(Akkusativ|Dativ|Genitiv|Akk\.?|Dat\.?|Gen\.?)\)?/i;
const CASE_NORMALIZE: Record<string, string> = {
  akkusativ: 'Akkusativ',
  'akk.': 'Akkusativ',
  akk: 'Akkusativ',
  dativ: 'Dativ',
  'dat.': 'Dativ',
  dat: 'Dativ',
  genitiv: 'Genitiv',
  'gen.': 'Genitiv',
  gen: 'Genitiv',
};
const PREPOSITIONS = [
  'an', 'auf', 'aus', 'bei', 'durch', 'für', 'gegen', 'in', 'mit', 'nach',
  'ohne', 'über', 'um', 'unter', 'von', 'vor', 'zu', 'zwischen',
];

export function extractGovernment(entry: KaikkiEntry, pos: PartOfSpeech): string | undefined {
  if (pos !== 'VERB') return undefined;

  const texts = entry.senses.flatMap((s) => [...s.glosses, ...s.examples.map((e) => e.text ?? '')]);
  for (const text of texts) {
    const caseMatch = text.match(CASE_PATTERN);
    if (!caseMatch) continue;
    const caseWord = CASE_NORMALIZE[caseMatch[1].toLowerCase()];
    if (!caseWord) continue;
    const prep = PREPOSITIONS.find((p) => new RegExp(`\\b${p}\\b`, 'i').test(text));
    if (prep) return `${prep} + ${caseWord}`;
  }
  return undefined;
}

// ─── Senses ─────────────────────────────────────────────────────────────────

export interface MappedSense {
  translation: string;
  example?: string;
}

const MAX_SENSES = 5;

export function mapSenses(entry: KaikkiEntry): MappedSense[] {
  const senses: MappedSense[] = [];
  for (const sense of entry.senses) {
    if (sense.form_of.length > 0) continue; // defensive: shouldn't occur once formOf-gated upstream
    if (sense.glosses.length === 0) continue;
    senses.push({
      translation: sense.glosses.join('; '),
      example: sense.examples.find((e) => e.text)?.text,
    });
    if (senses.length >= MAX_SENSES) break;
  }
  return senses;
}

// ─── Forms ──────────────────────────────────────────────────────────────────

export interface MappedForm {
  surface: string;
  normalized: string;
  features: Record<string, unknown>;
}

const PERSON_MAP: Record<string, number> = { 'first-person': 1, 'second-person': 2, 'third-person': 3 };
const NUMBER_MAP: Record<string, string> = { singular: 'SG', plural: 'PL' };
const TENSE_MAP: Record<string, string> = {
  present: 'PRES',
  past: 'PAST',
  perfect: 'PERF',
  pluperfect: 'PLUPERF',
  future: 'FUT',
};
const MOOD_MAP: Record<string, string> = { indicative: 'IND', subjunctive: 'SUBJ', imperative: 'IMP' };
const CASE_MAP: Record<string, string> = {
  nominative: 'NOM',
  accusative: 'ACC',
  dative: 'DAT',
  genitive: 'GEN',
};
const DEGREE_TAGS = new Set(['positive', 'comparative', 'superlative']);

export function parseFormTags(tags: string[]): Record<string, unknown> {
  const features: Record<string, unknown> = { raw: tags };
  for (const t of tags) {
    if (t in PERSON_MAP) features.person = PERSON_MAP[t];
    else if (t in NUMBER_MAP) features.number = NUMBER_MAP[t];
    else if (t in TENSE_MAP) features.tense = TENSE_MAP[t];
    else if (t in MOOD_MAP) features.mood = MOOD_MAP[t];
    else if (t in CASE_MAP) features.case = CASE_MAP[t];
    else if (DEGREE_TAGS.has(t)) features.degree = t.toUpperCase();
  }
  return features;
}

// kaikki's inflection-table extraction leaks non-word metadata into forms[]
// (verified against real data): a 'table-tags'-tagged row holds the table's
// declension/conjugation class name as if it were a form (e.g. "strong"), an
// 'inflection-template'-tagged row holds the template's own name (e.g.
// "de-ndecl"), a 'class'-tagged row holds the class label (e.g. "4 strong"),
// and an 'auxiliary'-tagged row holds the verb's auxiliary (read separately
// in extractAuxiliary before this filter runs). None of these are real
// inflected forms; left in, a high-frequency one (like "haben") silently
// inflates an unrelated word's frequency-rollup score.
const JUNK_FORM_TAGS = new Set(['table-tags', 'inflection-template', 'class', 'auxiliary']);

// Bare articles occasionally leak into a *different* word's declension table
// as a "definite"-tagged form (e.g. a neuter noun's table emitting a lone
// "das" row). A real inflected form of a noun/verb/adjective is never simply
// an article by itself, so drop these; phrasal forms are caught below by the
// whitespace check, not this one.
const BARE_ARTICLES = new Set(['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines']);

function isJunkForm(f: KaikkiForm): boolean {
  if (f.tags.some((t) => JUNK_FORM_TAGS.has(t))) return true;
  // Periphrastic/phrasal constructions ("habe geschoren") - the app's
  // LookupService resolves one sentence token at a time, so a multi-word
  // WordForm.normalized value could never be matched anyway.
  if (f.form.includes(' ')) return true;
  if ((f.tags.includes('definite') || f.tags.includes('indefinite')) && BARE_ARTICLES.has(f.form.toLowerCase())) return true;
  return false;
}

// kaikki dumps the ENTIRE personal-pronoun declension table (every person x
// number x case) into each individual pronoun's own raw entry (verified:
// "ich"'s forms[] includes "du", "er", "sie", "wir", "ihr", "Sie" rows too --
// the whole shared reference table, not just "ich"'s own inflections). Left
// unfiltered, every personal pronoun's WordForm set collides with every
// other's, so a lookup for "ich" matches ~10 unrelated lexemes. Keep only the
// rows whose person/number/gender agree with the entry's own identity, read
// off the self-referencing row(s) -- the table cell(s) that literally equal
// the headword (e.g. "sie" legitimately has two self-rows: 3rd-singular-
// feminine and 3rd-plural, since German really does spell both the same way).
interface PronounSignature {
  person?: number;
  number?: string;
  gender?: Gender;
}

function pronounSignature(tags: string[]): PronounSignature {
  const sig: PronounSignature = {};
  for (const t of tags) {
    if (t in PERSON_MAP) sig.person = PERSON_MAP[t];
    else if (t in NUMBER_MAP) sig.number = NUMBER_MAP[t];
    else if (t in GENDER_TAGS) sig.gender = GENDER_TAGS[t];
  }
  // kaikki's pronoun-table extraction never attaches an explicit person tag to
  // 2nd-person cells specifically -- it marks them "error-unrecognized-form"
  // instead (verified: every 2nd-person row in the shared paradigm table, both
  // familiar "du/dich/..." and formal "Sie/Ihnen/...", carries this tag and no
  // first-/third-person tag; no 1st/3rd-person row carries it). Read it as the
  // 2nd-person signal it actually is, or every 2nd-person form falls through
  // the "no person tag" fallback below and leaks into every other pronoun.
  if (sig.person === undefined && tags.includes('error-unrecognized-form')) sig.person = 2;
  return sig;
}

function hasPersonSignal(tags: string[]): boolean {
  return tags.some((t) => t in PERSON_MAP) || tags.includes('error-unrecognized-form');
}

function signaturesMatch(a: PronounSignature, b: PronounSignature): boolean {
  return a.person === b.person && a.number === b.number && (a.gender ?? null) === (b.gender ?? null);
}

function filterPronounForms(entry: KaikkiEntry): KaikkiForm[] {
  const selfSignatures = entry.forms
    .filter((f) => f.form.toLowerCase() === entry.word.toLowerCase() && hasPersonSignal(f.tags))
    .map((f) => pronounSignature(f.tags));

  // nothing to key off -- leave untouched (e.g. der/die/das share one real
  // paradigm with no person tags at all, so there's no collision to resolve)
  if (selfSignatures.length === 0) return entry.forms;

  return entry.forms.filter((f) => {
    if (!hasPersonSignal(f.tags)) return true; // not part of the person/number paradigm table -- unaffected by the collision
    return selfSignatures.some((self) => signaturesMatch(self, pronounSignature(f.tags)));
  });
}

export function collectSurfaceForms(entry: KaikkiEntry, separablePrefix?: string): { surface: string; tags: string[] }[] {
  const seen = new Set<string>();
  const out: { surface: string; tags: string[] }[] = [];

  const add = (surface: string, tags: string[]) => {
    if (!surface || surface === '-') return;
    const dedupeKey = `${surface} ${tags.join(',')}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    out.push({ surface, tags });
  };

  add(entry.word, ['lemma']);
  const rawForms = mapPos(entry.pos) === 'PRONOUN' ? filterPronounForms(entry) : entry.forms;
  for (const f of rawForms) {
    if (separablePrefix) {
      const parts = f.form.split(' ');
      if (parts.length === 2 && parts[1].toLowerCase() === separablePrefix.toLowerCase()) {
        add(parts[0], f.tags);
        continue;
      }
    }
    if (isJunkForm(f)) continue;
    add(f.form, f.tags);
  }
  return out;
}

export function mapForms(entry: KaikkiEntry, separablePrefix?: string): MappedForm[] {
  return collectSurfaceForms(entry, separablePrefix).map(({ surface, tags }) => ({
    surface,
    normalized: foldForLookup(surface),
    features: parseFormTags(tags),
  }));
}

export interface FormOfHarvest {
  targetLemma: string;
  surface: string;
  features: Record<string, unknown>;
  // A diminutive is grammatically always neuter in German regardless of its
  // base noun's own gender (Händchen "n" is a diminutive of Hand "f") — so
  // the harvest entry's own extracted gender is never valid evidence for
  // which target lexeme it belongs to (verified: without this, "Händchen"/
  // "Händlein" — real diminutives of feminine "Hand" — cross-attach onto an
  // unrelated neuter "Hand" homograph, sender's own gender coincidentally
  // matching the diminutive's always-neuter gender). Callers must not use
  // gender to narrow candidates for a diminutive harvest.
  isDiminutive: boolean;
}

/** kaikki's standalone inflected-form entries (e.g. "Journals" form_of "Journal") — an extra WordForm source layered onto the target lemma's own `forms` array. */
export function harvestFormOfForms(entry: KaikkiEntry, lemmaSet: ReadonlySet<string>): FormOfHarvest[] {
  const out: FormOfHarvest[] = [];
  for (const sense of entry.senses) {
    if (sense.form_of.length === 0) continue;
    const isDiminutive = sense.tags.includes('diminutive');
    const tags = sense.tags.filter((t) => t !== 'form-of' && t !== 'inflection-of');
    for (const fo of sense.form_of) {
      if (fo.word === entry.word || !lemmaSet.has(fo.word)) continue; // same guard as isFormOfEntry — never harvest a bogus/self target
      out.push({ targetLemma: fo.word, surface: entry.word, features: parseFormTags(tags), isDiminutive });
    }
  }
  return out;
}

export function scoreEntry(entry: KaikkiEntry, freq: Map<string, number>, separablePrefix?: string): number {
  let score = 0;
  const surfaces = new Set(collectSurfaceForms(entry, separablePrefix).map((f) => foldForLookup(f.surface)));
  for (const surface of surfaces) score += freq.get(surface) ?? 0;
  return score;
}

export type { KaikkiEntry, KaikkiForm };
