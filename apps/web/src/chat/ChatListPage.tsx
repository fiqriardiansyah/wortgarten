import { Link } from 'react-router-dom';
import { tokens } from '@/design/tokens';
import { useChatInbox } from '@/chat/api/useChat';

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ChatListPage() {
  const { data, isLoading, isError, refetch } = useChatInbox();

  if (isLoading) return <div className="py-12 text-center text-muted">Loading chats…</div>;
  if (isError || !data) {
    return (
      <div className="py-12 text-center text-muted">
        Failed to load your chats.{' '}
        <button onClick={() => refetch()} className="font-semibold text-teal hover:underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-[28px] font-extrabold leading-tight text-ink">Chats</h1>

      <div className="flex flex-col gap-2">
        {data.conversations.map((conversation) => (
          <Link
            key={conversation.id}
            to={`/chats/${conversation.id}`}
            className="flex items-center gap-3 rounded-2xl border-2 border-line bg-surface px-4 py-3 transition-colors hover:border-teal"
          >
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-extrabold text-white"
              style={{ backgroundColor: tokens.color.teal }}
              aria-hidden
            >
              {conversation.characterName.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-bold text-ink">{conversation.characterName}</p>
                <span className="shrink-0 text-xs text-muted">{timeLabel(conversation.lastMessageAt)}</span>
              </div>
              <p className="truncate text-sm text-muted">{conversation.lastMessageText ?? 'Say hi!'}</p>
            </div>
            {conversation.unreadCount > 0 && (
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tokens.color.yellow }} aria-label="Unread" />
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
