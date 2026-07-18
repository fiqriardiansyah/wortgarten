import type { AiJob } from '@wortgarten/shared';

export interface Prompt {
  system: string;
  user: string;
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

function storyPrompt(job: AiJob): Prompt {
  const words = job.allowedWords.join(', ');
  const meta = (job.meta ?? {}) as { newWordDisplayLemmas?: string[] };
  const newWords = meta.newWordDisplayLemmas ?? [];
  const featureLine =
    newWords.length > 0
      ? ` Feature ${newWords.length > 1 ? 'these new words' : 'this new word'} naturally, more than once if it fits: ${newWords.join(', ')}.`
      : '';

  return {
    system:
      'You write very short, simple (A1-A2 level) German stories for language learners. Reply with ' +
      'strict JSON only, matching exactly {"title": "...", "paragraphs": ["...", "..."], ' +
      '"translation": "..."} — no extra text, no markdown, no code fences.',
    user:
      `Write a short German story using ONLY these words: ${words}. You may inflect them normally ` +
      `(conjugate verbs, decline nouns, add adjective endings, split separable verbs across a ` +
      `clause) but introduce NO other vocabulary.${featureLine} Aim for about ${job.maxWords} words ` +
      `total, split into a few short paragraphs. Also include "translation": a plain English ` +
      `translation of the whole story, as one string.`,
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
