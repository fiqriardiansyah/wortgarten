import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Brain } from 'lucide-react';
import { useChatThread, useMarkWordKnownInChat, usePostTurn } from '@/chat/api/useChat';
import { MemoryPanel } from '@/chat/components/MemoryPanel';
import { MessageBubble } from '@/chat/components/MessageBubble';
import { ReplySlot } from '@/chat/components/ReplySlot';

export function ChatThreadPage() {
  const { conversationId = '' } = useParams<{ conversationId: string }>();
  const { data, isLoading, isError, refetch } = useChatThread(conversationId);
  const postTurn = usePostTurn(conversationId);
  const markWordKnown = useMarkWordKnownInChat(conversationId);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [data?.messages.length]);

  if (isLoading) return <div className="py-12 text-center text-muted">Loading conversation…</div>;
  if (isError || !data) {
    return (
      <div className="py-12 text-center text-muted">
        Failed to load this conversation.{' '}
        <button onClick={() => refetch()} className="font-semibold text-teal hover:underline">
          Try again
        </button>
      </div>
    );
  }

  const canSend = data.turnsRemainingToday > 0 && !postTurn.isPending;
  // The reply director's plan lives on the last CHARACTER message (see chat.service.ts) — the
  // client renders whatever it's handed and defaults to "type" if there isn't one yet.
  const lastCharacterMessage = [...data.messages].reverse().find((m) => m.sender === 'character');
  const plan = lastCharacterMessage?.nextReplyPlan;

  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-ink">{data.characterName}</h1>
        <button
          type="button"
          onClick={() => setMemoryOpen(true)}
          className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-teal"
          title={`What ${data.characterName} remembers about you`}
        >
          <Brain size={16} />
        </button>
      </div>
      <MemoryPanel conversationId={conversationId} open={memoryOpen} onClose={() => setMemoryOpen(false)} />

      <div className="flex flex-col gap-4 pb-4">
        {data.messages.map((message) => (
          <MessageBubble key={message.id} message={message} onAddWord={markWordKnown} />
        ))}
        <div ref={bottomRef} />
      </div>

      <p className="mb-2 text-center text-xs text-muted">
        {data.turnsRemainingToday > 0 ? `${data.turnsRemainingToday} messages left today` : "You've used today's messages — come back tomorrow!"}
      </p>

      <div className="sticky bottom-0 bg-bg pb-2 pt-2">
        <ReplySlot
          key={lastCharacterMessage?.id ?? 'none'}
          mode={plan?.mode ?? 'type'}
          scaffold={plan?.scaffold}
          onSubmit={(text) => postTurn.mutate(text)}
          disabled={!canSend}
        />
      </div>
    </div>
  );
}
