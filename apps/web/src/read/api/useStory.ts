import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AddWordResponseSchema, StorySchema } from '@wortgarten/shared';
import type { Story, StoryToken } from '@wortgarten/shared';
import { apiFetch, apiSend } from '@/lib/apiClient';

export function useStory(id: string) {
  return useQuery({
    queryKey: ['read', 'story', id],
    queryFn: () => apiFetch(`/stories/${id}`, StorySchema),
    enabled: id.length > 0,
  });
}

/** Optimistically flips every token for `lexemeId` from "new" to "known" and drops it from
 * `newWords` — the visible half of "+ Add to my words". Rolled back in `onError` if the POST
 * to the real bank fails. */
function markLexemeKnown(story: Story, lexemeId: string): Story {
  return {
    ...story,
    newWords: story.newWords.filter((id) => id !== lexemeId),
    paragraphs: story.paragraphs.map((paragraph) => ({
      tokens: paragraph.tokens.map((token) =>
        token.lexemeId === lexemeId && token.status === 'new' ? { ...token, status: 'known' } : token,
      ),
    })),
  };
}

export function useMarkWordKnown(storyId: string) {
  const queryClient = useQueryClient();
  const storyKey = ['read', 'story', storyId];

  const mutation = useMutation({
    mutationFn: ({ senseId }: { lexemeId: string; senseId: string }) =>
      apiSend('POST', '/words', AddWordResponseSchema, { senseId, sourceType: 'read' }),
    onMutate: async ({ lexemeId }) => {
      await queryClient.cancelQueries({ queryKey: storyKey });
      const previous = queryClient.getQueryData<Story>(storyKey);
      queryClient.setQueryData<Story>(storyKey, (current) => (current ? markLexemeKnown(current, lexemeId) : current));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(storyKey, ctx.previous);
    },
    // Deliberately does NOT invalidate `storyKey` on success. `paragraphs` is a frozen snapshot
    // written once at generation time (the worker's overnight tokenMap); StoriesService reconciles
    // `status: 'new'` tokens against the live bank on every read, so a refetch here would already
    // show `known` — but the optimistic flip renders instantly without waiting on a round trip,
    // so there's nothing to gain by forcing one.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['words'] });
      queryClient.invalidateQueries({ queryKey: ['home'] });
    },
  });

  // Tap-a-word only ever hands back a lexemeId (WordPopup's frozen contract); the sense to add
  // lives on the token itself, resolved server-side by the overnight tokenMap. A `new` word with
  // no resolvable sense (ambiguous lexeme, no single-sense fallback) can't be added — degrade by
  // logging, not by crashing or silently pretending it worked.
  return (token: StoryToken) => {
    if (!token.senseId || !token.lexemeId) {
      console.error(`Cannot add lexeme ${token.lexemeId}: token has no resolvable senseId`);
      return;
    }
    mutation.mutate({ lexemeId: token.lexemeId, senseId: token.senseId });
  };
}
