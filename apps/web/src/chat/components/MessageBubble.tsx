import { useState } from 'react';
import type { Message, StoryToken } from '@wortgarten/shared';
import { SpeakButton } from '@/components/ui/SpeakButton';
import { TokenSpan } from '@/read/components/TokenSpan';
import { WordPopup } from '@/read/components/WordPopup';

interface MessageBubbleProps {
  message: Message;
  onAddWord: (token: StoryToken) => void;
}

/** A character bubble is tappable/speakable/translatable, reusing the exact same `TokenSpan` +
 * `WordPopup` the Reader uses (Message.tokens/glossary carry `StoryToken`/`StoryGlossaryEntry`
 * verbatim — see the plan's deviation note). A user bubble is plain text: the user wrote it
 * themselves, nothing to resolve or tap. */
export function MessageBubble({ message, onAddWord }: MessageBubbleProps) {
  const [selected, setSelected] = useState<StoryToken | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);

  if (message.sender === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-teal px-4 py-2.5 text-sm text-white">{message.text}</div>
      </div>
    );
  }

  const resolvedText = message.tokens?.map((t) => t.text).join('') ?? message.text;

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="max-w-[80%] rounded-2xl rounded-bl-sm border-2 border-line bg-surface px-4 py-2.5 text-sm text-ink">
        {message.tokens ? message.tokens.map((token, i) => <TokenSpan key={i} token={token} onTap={setSelected} />) : message.text}
      </div>

      <div className="flex items-center gap-2 pl-1 text-xs text-muted">
        <SpeakButton text={resolvedText} size={14} />
        {message.translation && (
          <button type="button" onClick={() => setShowTranslation((v) => !v)} className="font-semibold text-teal hover:underline">
            {showTranslation ? 'Hide' : 'Show'} translation
          </button>
        )}
        {/* Never an error state, never coral — just an honest "this reply came from the slower
            brain" signal while GROQ is unavailable (see Seam 2's scripted fallback). */}
        {message.source === 'scripted' && <span className="italic opacity-60">slower reply</span>}
      </div>
      {showTranslation && message.translation && <p className="pl-1 text-xs text-muted">{message.translation}</p>}

      {selected && message.glossary && (
        <WordPopup
          glossary={message.glossary}
          token={selected}
          paragraph={{ tokens: message.tokens ?? [] }}
          onAdd={() => {
            onAddWord(selected);
            setSelected(null);
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
