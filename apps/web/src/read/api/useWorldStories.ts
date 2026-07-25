import { useQuery } from '@tanstack/react-query';
import { WorldStoriesResponseSchema } from '@wortgarten/shared';
import { apiFetch } from '@/lib/apiClient';

export function useWorldStories(worldKey: string | null) {
  return useQuery({
    queryKey: ['worlds', 'stories', worldKey],
    queryFn: () => apiFetch(`/worlds/${worldKey}/stories`, WorldStoriesResponseSchema),
    enabled: worldKey !== null,
  });
}
