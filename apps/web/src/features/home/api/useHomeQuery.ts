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
  });
}
