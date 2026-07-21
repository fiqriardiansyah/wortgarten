import { useQuery } from '@tanstack/react-query';
import { MeResponseSchema } from '@wortgarten/shared';
import { apiFetch } from '@/lib/apiClient';

export function useProfileQuery() {
  return useQuery({
    queryKey: ['profile', 'me'],
    queryFn: () => apiFetch('/me', MeResponseSchema),
  });
}
