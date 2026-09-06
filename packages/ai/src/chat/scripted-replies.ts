import type { CharacterArchetype } from '../adapters/prompts';

/** Friendly, in-world, safety-reviewed lines — the same rules from persona-prompt.ts's
 * SAFETY_PREFIX apply here too, they're just hand-written instead of model-generated. Used when
 * Groq is unavailable (AiQuota exhausted, STORY_CHAT_ENABLED off, or the checker never found a
 * high-enough-coverage reply) so a chat never dies mid-sentence — see run-chat-turn.ts. Doesn't
 * attempt to understand the user's message; a friendly, generic continuation is the whole point
 * of "a slower brain, still alive." */
const SCRIPTED_REPLIES: Record<CharacterArchetype, { text: string; translation: string }[]> = {
  friendly_host: [
    { text: 'Das ist schön! Erzähl mir mehr davon.', translation: "That's nice! Tell me more about that." },
    { text: 'Wirklich? Das freut mich zu hören.', translation: "Really? That's nice to hear." },
    { text: 'Ich verstehe. Und was machst du dann?', translation: 'I see. And what do you do then?' },
  ],
  curious_kid: [
    { text: 'Oh, spannend! Und was passiert danach?', translation: "Oh, exciting! And what happens next?" },
    { text: 'Cool! Ich möchte das auch machen.', translation: 'Cool! I want to do that too.' },
    { text: 'Warum? Das will ich genau wissen!', translation: 'Why? I really want to know that!' },
  ],
  calm_shopkeeper: [
    { text: 'Ah, verstehe. Kann ich dir sonst noch helfen?', translation: 'Ah, I see. Can I help you with anything else?' },
    { text: 'Kein Problem. Nimm dir Zeit.', translation: "No problem. Take your time." },
    { text: 'Gute Frage. Lass uns das zusammen anschauen.', translation: "Good question. Let's look at that together." },
  ],
  cheerful_traveler: [
    { text: 'Wie schön! Ich liebe solche Geschichten.', translation: 'How nice! I love stories like that.' },
    { text: 'Das klingt nach einem Abenteuer!', translation: 'That sounds like an adventure!' },
    { text: 'Ja genau! Und wohin geht die Reise dann?', translation: 'Exactly! And where does the trip go from there?' },
  ],
};

// Used if a Character somehow carries an archetype outside CHARACTER_ARCHETYPES (an older row,
// or a model drift) — never crash the chat over a missing bank.
const FALLBACK_REPLY = { text: 'Wie bitte? 😅 Das habe ich nicht verstanden.', translation: "Sorry? 😅 I didn't understand that." };

export function pickScriptedReply(archetype: string): { text: string; translation: string } {
  const bank = SCRIPTED_REPLIES[archetype as CharacterArchetype];
  if (!bank || bank.length === 0) return FALLBACK_REPLY;
  return bank[Math.floor(Math.random() * bank.length)];
}
