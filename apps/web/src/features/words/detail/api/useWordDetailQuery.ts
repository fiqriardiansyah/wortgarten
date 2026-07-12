import { useQuery } from '@tanstack/react-query';
import { WordDetailSchema } from '@wortgarten/shared';
import { apiFetch } from '@/lib/apiClient';

export function useWordDetailQuery(id: string) {
  return useQuery({
    queryKey: ['words', 'detail', id],
    queryFn: () => apiFetch(`/words/${id}`, WordDetailSchema),
    enabled: Boolean(id),
  });
}
