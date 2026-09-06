import { CHAT_MEMORY_MAX_FACTS } from '@wortgarten/shared';
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
    `"translation":"The dog runs in the park.\\n\\n${name} sees the dog. She laughs.",` +
    `"characterName":"${name}","characterRole":"a girl who loves dogs","characterPersonaLine":` +
    `"Cheerful and curious, always noticing small details about animals.","characterArchetype":"friendly_host"}`
  );
}

// Story Chat picks the fallback bank by this value when Groq is unavailable — keep the pool
// small and stable so scripted-replies.ts's Record<archetype, string[]> stays exhaustive.
export const CHARACTER_ARCHETYPES = ['friendly_host', 'curious_kid', 'calm_shopkeeper', 'cheerful_traveler'] as const;
export type CharacterArchetype = (typeof CHARACTER_ARCHETYPES)[number];

function storyPrompt(job: AiJob): Prompt {
  const meta = (job.meta ?? {}) as { newWordDisplayLemmas?: string[]; worldHint?: string };
  const newWords = meta.newWordDisplayLemmas ?? [];
  const words = cappedVocabulary(job, newWords).join(', ');
  const names = pickStoryNames(3);
  const featureLine =
    newWords.length > 0
      ? `Repeat ${newWords.length > 1 ? 'these new words' : 'this new word'} rather than reaching for another one: ${newWords.join(', ')}.\n`
      : '';
  // A hint, never a rule — deliberately not checked by anything downstream. See select-world.ts.
  const worldLine = meta.worldHint ? `${meta.worldHint}\n` : '';

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
      worldLine +
      '\nAlso name the story\'s lead character (usually its main human, one of the Names above) so the reader can later ' +
      'chat with them: "characterName" (one of the Names above), "characterRole" (a short in-world description, e.g. ' +
      '"a boy who lost his keys"), "characterPersonaLine" (one sentence describing their personality, in English), and ' +
      `"characterArchetype" (exactly one of: ${CHARACTER_ARCHETYPES.join(', ')}).\n` +
      '\nReturn exactly this shape (the example below is illustrative only — write your own story):\n' +
      storyExample(names[0]),
  };
}

interface ChatTurnMeta {
  systemPrompt: string;
  /** Capped display-lemma list (see MAX_PROMPT_WORDS) — the reader's known+function words, no
   * "new word" concept for chat. Shown to the model the same way STORY shows its allowlist. */
  allowlistDisplay: string[];
  history: { role: 'user' | 'character'; text: string }[];
  userText: string;
}

// The system prompt is fully assembled by the caller (safety prefix + persona + level-cap
// instruction — see packages/ai/src/chat/persona-prompt.ts) and just carried through job.meta,
// the same escape hatch STORY already uses for newWordDisplayLemmas/worldHint. buildPrompt stays
// the one place both adapters get their instructions from, even for a job shape this dynamic.
function chatTurnPrompt(job: AiJob): Prompt {
  const meta = job.meta as unknown as ChatTurnMeta;
  const transcript = meta.history.map((turn) => `${turn.role === 'user' ? 'User' : 'You'}: ${turn.text}`).join('\n');
  const words = meta.allowlistDisplay.slice(0, MAX_PROMPT_WORDS).join(', ');

  return {
    system:
      `${meta.systemPrompt}\n\n` +
      `Vocabulary you should stay inside for this reply: ${words}. It's fine to use a word slightly ` +
      'outside this list if the conversation truly needs it — just prefer these words when you can.\n\n' +
      'Reply with a single JSON object and nothing else — no markdown, no code fences, no prose ' +
      'before or after it — matching exactly {"reply": "...", "translation": "...", "suggestedReplies": ' +
      '["...", "..."]}, where "reply" is your in-character German reply (one or two short sentences), ' +
      '"translation" is its English translation, and "suggestedReplies" is 0-3 short, simple things ' +
      'the learner could plausibly say back to you, in German, using only the vocabulary above — omit ' +
      'it (or leave it empty) whenever nothing natural fits.',
    user: (transcript ? `${transcript}\n` : '') + `User: ${meta.userText}`,
  };
}

interface ChatMemoryMeta {
  oldSummary: string;
  oldFacts: string[];
  newBubbles: { role: 'user' | 'character'; text: string }[];
}

// Night-only (see AiJobTypeSchema's doc comment) — this prompt is never sent from the request
// path, so it's fine for it to be slower/more deliberate than chatTurnPrompt. Deliberately
// restates the child-safety deny list here even though memory-safety.ts enforces it in code too:
// two independent layers, one in the prompt (best-effort, cheap) and one in plain code
// (authoritative) — see the spec's "both...must enforce this" rule.
function memoryPrompt(job: AiJob): Prompt {
  const meta = job.meta as unknown as ChatMemoryMeta;
  const transcript = meta.newBubbles.map((turn) => `${turn.role === 'user' ? 'User' : 'Character'}: ${turn.text}`).join('\n');
  const oldFactsLine = meta.oldFacts.length > 0 ? meta.oldFacts.map((f) => `- ${f}`).join('\n') : '(none yet)';

  return {
    system:
      'You maintain a short private memory note for a language-practice chat character, so the ' +
      'character can remember a learner across days. Write in English. Reply with a single JSON ' +
      'object and nothing else — no markdown, no code fences, no prose before or after it, ' +
      'matching exactly {"summary": "...", "facts": ["...", "..."]}.\n\n' +
      'STRICT RULES — never violate these:\n' +
      '- NEVER invent or assume a fact. Only record something the learner (or your own prior reply) ' +
      'actually said in the messages below — if you are not sure it was really said, leave it out.\n' +
      '- NEVER include the learner\'s real name, age, birthday, address, school, employer, phone ' +
      'number, email, or any other detail that could identify or locate them, even if they said it ' +
      'directly.\n' +
      '- NEVER include health, family, or financial details.\n' +
      '- NEVER include anything the learner asked to keep secret, or anything about meeting in ' +
      'person.\n' +
      '- Only keep light, harmless learning notes (e.g. a grammar point they struggled with) and ' +
      'preferences/topics they actually volunteered (e.g. a hobby, or why they are learning German). ' +
      'If in doubt, leave it out.',
    user:
      `Previous summary: ${meta.oldSummary || '(none yet)'}\n\n` +
      `Previous facts:\n${oldFactsLine}\n\n` +
      `New messages since then:\n${transcript || '(none)'}\n\n` +
      'Write an updated "summary" (a few warm sentences, in English: what you\'ve talked about and ' +
      'how the learner is doing — topics, a struggle, a small win) that folds in anything worth ' +
      `keeping from the previous summary plus the new messages above. Write an updated "facts" list ` +
      `(at most ${CHAT_MEMORY_MAX_FACTS} short items) carrying forward any previous facts still ` +
      'relevant plus any new safe ones — drop anything that violates the safety rules above, even ' +
      'if that means dropping something from the previous facts list too.',
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
    case 'CHAT_TURN':
      return chatTurnPrompt(job);
    case 'CHAT_MEMORY':
      return memoryPrompt(job);
  }
}
