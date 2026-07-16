import { useQuery } from '@tanstack/react-query';
import { ProgressDashboardSchema } from '@wortgarten/shared';
import { apiFetch } from '@/lib/apiClient';

export function useProgressQuery() {
  return useQuery({
    queryKey: ['progress', 'streak-week-v1'],
    queryFn: () =>
      apiFetch('/progress', ProgressDashboardSchema, {
        headers: { 'X-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' },
      }),
  });
}
