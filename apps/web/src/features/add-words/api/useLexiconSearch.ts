import { useQuery } from '@tanstack/react-query';
import { LexiconSearchResponseSchema } from '@wortgarten/shared';
import { apiFetch } from '@/lib/apiClient';

export function useLexiconSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['lexicon-search', trimmed],
    queryFn: () => apiFetch(`/lexicon/search?q=${encodeURIComponent(trimmed)}`, LexiconSearchResponseSchema),
    enabled: trimmed.length > 0,
  });
}
