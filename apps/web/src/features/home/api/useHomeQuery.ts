import { useQuery } from '@tanstack/react-query';
import { HomeDashboardSchema } from '@wortgarten/shared';
import { apiFetch } from '@/lib/apiClient';

export function useHomeQuery() {
  return useQuery({
    queryKey: ['home'],
    queryFn: () =>
      apiFetch('/home', HomeDashboardSchema, {
        headers: { 'X-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' },
      }),
    // Story generation is fire-and-forget on the API side (lazy remote trigger, no push channel
    // back to the client) — poll while a story is in flight so the card flips to 'ready' on its
    // own instead of needing a manual refresh. Stops the moment it's no longer 'generating'.
    refetchInterval: (query) => (query.state.data?.story.state === 'generating' ? 4000 : false),
  });
}
