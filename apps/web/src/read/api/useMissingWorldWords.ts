import { useQuery } from '@tanstack/react-query';
import { MissingWorldWordsResponseSchema } from '@wortgarten/shared';
import { apiFetch } from '@/lib/apiClient';

export function useMissingWorldWords(worldKey: string | null) {
  return useQuery({
    queryKey: ['worlds', 'missing-words', worldKey],
    queryFn: () => apiFetch(`/worlds/${worldKey}/missing-words`, MissingWorldWordsResponseSchema),
    enabled: worldKey !== null,
  });
}
