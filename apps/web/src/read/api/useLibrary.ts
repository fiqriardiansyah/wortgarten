import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { LibraryResponseSchema } from '@wortgarten/shared';
import { apiFetch, apiSend } from '@/lib/apiClient';

export function useLibrary() {
  return useQuery({
    queryKey: ['read', 'library'],
    queryFn: () => apiFetch('/stories', LibraryResponseSchema),
    // Same reasoning as useHomeQuery: generation is fire-and-forget server-side, so poll while
    // TomorrowStoryCard is showing and stop once a story lands or pendingState clears.
    refetchInterval: (query) => (query.state.data?.pendingState === 'generating' ? 4000 : false),
  });
}

const GenerateStoryResultSchema = z.union([
  z.object({ status: z.literal('shipped'), storyId: z.string() }),
  z.object({ status: z.literal('skipped'), reason: z.string() }),
]);

/** Dev-only: fires StoriesService.forceGenerateForDev (see the API-side 403/production guard).
 * Never wired into any production UI path — see the "DEVELOPMENT ONLY" button in ReadPage. */
export function useGenerateStoryDev() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend('POST', '/stories/generate', GenerateStoryResultSchema),
    onSuccess: (result) => {
      console.log('[useGenerateStoryDev] result:', result);
      queryClient.invalidateQueries({ queryKey: ['read', 'library'] });
    },
    onError: (err) => console.error('[useGenerateStoryDev] failed:', err),
  });
}
