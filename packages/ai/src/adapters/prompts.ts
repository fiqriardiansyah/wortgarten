import type { AiJob } from '@wortgarten/shared';

export interface Prompt {
  system: string;
  user: string;
}

// Small models copy shape far better than they follow descriptions, and dumping the user's whole
// (potentially 200+ word) allowlist actively hurts compliance rather than raising it — cap what
// the STORY prompt shows, preferring the new words (the whole point of the story) then the
// user's known words.
export const MAX_PROMPT_WORDS = 60;

// The allowlist has no proper nouns (kaikki's dictionary carries none), so without a fixed cast
// the model is forced to invent one — a guaranteed out-of-vocabulary word in every single story.
// Pool is intentionally larger than what any single prompt shows (see pickStoryNames) — small
// models default to the first name(s) they see, so always offering all of them produced an
// Anna/Max monoculture regardless of story content.
const STORY_NAME_POOL = ['Anna', 'Max', 'Lena', 'Tom', 'Emma', 'Ben', 'Lea', 'Paul', 'Mia', 'Finn', 'Sophie', 'Jonas'];

// Sample without replacement, order shuffled too — an unshuffled subset would just move the
// primacy bias from "always Anna" to "always whichever name sorts first in the pool".
function pickStoryNames(count: number): string[] {
  const pool = [...STORY_NAME_POOL];
  const picked: string[] = [];
  while (picked.length < count && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(i, 1)[0]);
  }
  return picked;
}

function sanitySentencePrompt(job: AiJob): Prompt {
  const words = job.allowedWords.join(', ');
  return {
    system:
      'You are a careful German sentence writer for language learners. Reply with strict JSON ' +
      'only, matching exactly {"sentence": "..."} — no extra text, no markdown, no code fences.',
    user:
      `Write exactly one short German sentence using ONLY these words (plus basic punctuation): ` +
      `${words}. Maximum ${job.maxWords} words. Do not use any German word that is not in this list.`,
  };
}

function cappedVocabulary(job: AiJob, newWords: string[]): string[] {
  const newWordSet = new Set(newWords);
  const rest = job.allowedWords.filter((w) => !newWordSet.has(w));
  const budget = Math.max(0, MAX_PROMPT_WORDS - newWords.length);
  return [...newWords, ...rest.slice(0, budget)];
}

// One complete, minimal example of the exact expected shape — the single highest-leverage thing
// for small-model JSON compliance after native JSON mode. Deliberately shows the `\n\n` paragraph
// separator literally, since that's exactly what the model must reproduce inside its own strings.
// Name is a parameter, not hardcoded to "Anna": a few-shot example anchors small models onto
// whatever name it shows far harder than the allowlist alone does, so a fixed example name was
// re-introducing the same monoculture pickStoryNames exists to break.
function storyExample(name: string): string {
  return (
    `{"title":"Der Hund im Park","story":"Der Hund läuft im Park.\\n\\n${name} sieht den Hund. Sie lacht.",` +
    `"translation":"The dog runs in the park.\\n\\n${name} sees the dog. She laughs."}`
  );
}

function storyPrompt(job: AiJob): Prompt {
  const meta = (job.meta ?? {}) as { newWordDisplayLemmas?: string[] };
  const newWords = meta.newWordDisplayLemmas ?? [];
  const words = cappedVocabulary(job, newWords).join(', ');
  const names = pickStoryNames(3);
  const featureLine =
    newWords.length > 0
      ? `Repeat ${newWords.length > 1 ? 'these new words' : 'this new word'} rather than reaching for another one: ${newWords.join(', ')}.\n`
      : '';

  return {
    system:
      'You write very short, simple (A1-A2 level) German stories for language learners. You stay ' +
      'inside the vocabulary you are given and would rather repeat a word than introduce a new ' +
      'one. Reply with a single JSON object and nothing else — no markdown, no code fences, no ' +
      'prose before or after it.',
    user:
      `Write a short German story of about ${job.maxWords} words in 2-3 short paragraphs.\n\n` +
      `Vocabulary you may use: ${words}\n` +
      `Names you may use: ${names.join(', ')}\n\n` +
      'Rules:\n' +
      '- Inflect words normally: conjugate verbs, decline nouns, add adjective endings, split separable verbs across a clause.\n' +
      '- Write narration only. No dialogue. Do NOT use quotation marks of any kind (" „ " » « \') anywhere in the story or the title.\n' +
      '- Repeating a word is good. Simple sentences are good.\n' +
      '- If you need an idea you cannot express with these words, change the story — do not introduce a new word.\n' +
      '- The title uses only these words too.\n' +
      '- Separate paragraphs with a blank line (two newlines) inside "story", and the matching paragraph break inside "translation".\n' +
      featureLine +
      '\nReturn exactly this shape (the example below is illustrative only — write your own story):\n' +
      storyExample(names[0]),
  };
}

/** Both adapters build their prompt through here, so Groq and Ollama are always given the exact
 * same instructions — same shape in, same job type dispatch, one place to extend for future job
 * types. */
export function buildPrompt(job: AiJob): Prompt {
  switch (job.type) {
    case 'SANITY_SENTENCE':
      return sanitySentencePrompt(job);
    case 'STORY':
      return storyPrompt(job);
  }
}
