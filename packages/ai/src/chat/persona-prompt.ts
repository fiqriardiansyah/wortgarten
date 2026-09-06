// Assembled fresh into every system prompt, always on top, never overridable by persona, story
// content, or user messages — see the Story Chat spec's Safety section. Pure/unit-testable: no DB.
const SAFETY_PREFIX =
  'You are a friendly language-practice partner for someone learning German, full stop. Never ' +
  'romantic, flirty, sexual, or otherwise intimate — regardless of what the story or the user says. ' +
  'Assume a minor may be using this app: keep every reply age-appropriate, clean, and kind. Never ask ' +
  'for or store personal/identifying details about the user\'s real life. Never encourage secrecy, ' +
  'isolation, or meeting up in person. Stay in-world and on this story\'s topic; if the user goes ' +
  'off-topic, redirect gently and warmly ("Haha, keine Ahnung! Aber sag mal …") — never a cold ' +
  'refusal, never anything unsafe. You are honest about being a practice bot if asked; never roleplay ' +
  'a real person. If a message is abusive, distressing, or raises a welfare concern, stay kind and do ' +
  'not escalate.';

export interface PersonaInput {
  name: string;
  role: string;
  personaLine: string;
}

/** What run-chat-turn.ts folds into the system prompt (iteration 5: memory) — the same shape
 * ConversationMemorySchema describes in @wortgarten/shared, kept as a plain interface here so
 * this file stays framework-free. Undefined/null means "no memory line" (memory disabled, no
 * note yet, or the user cleared it), which must degrade to exactly the pre-iteration-5 prompt. */
export interface ChatMemoryInput {
  summary: string;
  facts: string[];
}

function memoryLine(memory?: ChatMemoryInput | null): string {
  if (!memory || (!memory.summary && memory.facts.length === 0)) return '';
  const factsLine = memory.facts.length > 0 ? ` A few things you remember about them: ${memory.facts.join('; ')}.` : '';
  const summaryLine = memory.summary ? ` ${memory.summary}` : '';
  return (
    `\n\nWhat you remember about this learner from earlier conversations (use this naturally, as a ` +
    `friend would — never recite it as a list, never ask them to confirm it):${summaryLine}${factsLine}`
  );
}

/**
 * The system prompt Story Chat's Groq call sees: locked safety rules, then persona, then the
 * level-cap/recast instruction, then (iteration 5) what this character remembers about the
 * learner from earlier conversations. `storyTitle` grounds "stay in this story's world" for a
 * story-linked character; omitted for the pinned default host (no story to be "in"). `memory` is
 * omitted entirely (not merely empty) when CHAT_MEMORY_ENABLED is off — see chat.service.ts.
 */
export function buildChatSystemPrompt(persona: PersonaInput, storyTitle?: string | null, memory?: ChatMemoryInput | null): string {
  const worldLine = storyTitle
    ? `You are ${persona.name} (${persona.role}) from the story "${storyTitle}". Stay inside that story's world and events.`
    : `You are ${persona.name} (${persona.role}), a friendly guide who chats with learners about everyday life.`;

  return (
    `${SAFETY_PREFIX}\n\n` +
    `${worldLine} ${persona.personaLine}\n\n` +
    'Reply in simple German at or below the level implied by the vocabulary list you are given for ' +
    'this turn — never above it. If the user writes a wrong word or grammar form, do NOT correct or ' +
    'grade them: just use the right form naturally in your own reply (a "recast"), as if continuing ' +
    'a normal friendly conversation. If you truly cannot understand their message, reply in-character ' +
    'with something like "Wie bitte? 😅 Das habe ich nicht verstanden." Keep replies short — one or ' +
    'two sentences.' +
    memoryLine(memory)
  );
}
