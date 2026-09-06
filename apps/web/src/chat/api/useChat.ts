import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AddWordResponseSchema,
  ChatInboxResponseSchema,
  ChatThreadResponseSchema,
  ChatTurnResponseSchema,
  ForgetMemoryResponseSchema,
  MemoryNoteResponseSchema,
  OpenConversationResponseSchema,
} from '@wortgarten/shared';
import type { ChatThreadResponse, StoryToken } from '@wortgarten/shared';
import { apiFetch, apiSend } from '@/lib/apiClient';

export function useChatInbox() {
  return useQuery({
    queryKey: ['chat', 'inbox'],
    queryFn: () => apiFetch('/chat/conversations', ChatInboxResponseSchema),
  });
}

export function useChatThread(conversationId: string) {
  return useQuery({
    queryKey: ['chat', 'thread', conversationId],
    queryFn: () => apiFetch(`/chat/conversations/${conversationId}/messages`, ChatThreadResponseSchema),
    enabled: conversationId.length > 0,
  });
}

/** Backs both the pinned default host and the "💬 Talk to [name]" button — get-or-create either
 * way; the caller never needs to know which case it is (see chat.controller.ts). */
export function useOpenConversation() {
  return useMutation({
    mutationFn: (characterId: string) => apiSend('POST', `/chat/characters/${characterId}/open`, OpenConversationResponseSchema),
  });
}

export function usePostTurn(conversationId: string) {
  const queryClient = useQueryClient();
  const threadKey = ['chat', 'thread', conversationId];

  return useMutation({
    mutationFn: (text: string) => apiSend('POST', `/chat/${conversationId}/turn`, ChatTurnResponseSchema, { text }),
    onSuccess: (data) => {
      queryClient.setQueryData<ChatThreadResponse>(threadKey, (current) =>
        current
          ? { ...current, messages: [...current.messages, data.userMessage, data.characterMessage], turnsRemainingToday: data.turnsRemainingToday }
          : current,
      );
      queryClient.invalidateQueries({ queryKey: ['chat', 'inbox'] });
      // A chat turn can flip today's streak — Home/Progress read it fresh next visit rather than
      // going stale until some unrelated navigation happens to invalidate them.
      queryClient.invalidateQueries({ queryKey: ['home'] });
      queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

/** Mirrors read/api/useStory.ts's useMarkWordKnown, but patches a chat thread's cached tokens
 * instead of a story's paragraphs, and tags the add as `sourceType: 'chat'`. */
export function useMarkWordKnownInChat(conversationId: string) {
  const queryClient = useQueryClient();
  const threadKey = ['chat', 'thread', conversationId];

  const mutation = useMutation({
    mutationFn: ({ senseId }: { lexemeId: string; senseId: string }) =>
      apiSend('POST', '/words', AddWordResponseSchema, { senseId, sourceType: 'chat' }),
    onMutate: async ({ lexemeId }) => {
      await queryClient.cancelQueries({ queryKey: threadKey });
      const previous = queryClient.getQueryData<ChatThreadResponse>(threadKey);
      queryClient.setQueryData<ChatThreadResponse>(threadKey, (current) =>
        current
          ? {
              ...current,
              messages: current.messages.map((message) =>
                message.tokens
                  ? { ...message, tokens: message.tokens.map((t) => (t.lexemeId === lexemeId ? { ...t, status: 'known' as const } : t)) }
                  : message,
              ),
            }
          : current,
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(threadKey, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['words'] });
      queryClient.invalidateQueries({ queryKey: ['home'] });
    },
  });

  return (token: StoryToken) => {
    if (!token.senseId || !token.lexemeId) {
      console.error(`Cannot add lexeme ${token.lexemeId}: token has no resolvable senseId`);
      return;
    }
    mutation.mutate({ lexemeId: token.lexemeId, senseId: token.senseId });
  };
}

/** Iteration 5 (memory): "What [name] remembers about you". `enabled` defaults to true but a
 * caller can pass false until the panel is actually opened, so an idle thread doesn't fetch it. */
export function useMemoryNote(conversationId: string, enabled = true) {
  return useQuery({
    queryKey: ['chat', 'memory', conversationId],
    queryFn: () => apiFetch(`/chat/conversations/${conversationId}/memory`, MemoryNoteResponseSchema),
    enabled: enabled && conversationId.length > 0,
  });
}

/** Iteration 5 (memory): "Forget this" — clears the note; the real message history is untouched. */
export function useForgetMemory(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiSend('DELETE', `/chat/conversations/${conversationId}/memory`, ForgetMemoryResponseSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'memory', conversationId] });
    },
  });
}
