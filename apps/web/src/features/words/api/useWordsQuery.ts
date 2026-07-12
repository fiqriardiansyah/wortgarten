import { useQuery } from '@tanstack/react-query';
import { WordsListResponseSchema, type WordFilter } from '@wortgarten/shared';
import { apiFetch } from '@/lib/apiClient';

export interface WordsQueryParams {
  q?: string;
  filter?: WordFilter;
  page?: number;
  pageSize?: number;
}

export function useWordsQuery(params: WordsQueryParams) {
  const search = new URLSearchParams();
  if (params.q?.trim()) search.set('q', params.q.trim());
  if (params.filter && params.filter !== 'all') search.set('filter', params.filter);
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));

  return useQuery({
    queryKey: ['words', params.q?.trim() ?? '', params.filter ?? 'all', params.page ?? 1, params.pageSize ?? 20],
    queryFn: () => apiFetch(`/words?${search.toString()}`, WordsListResponseSchema),
  });
}
