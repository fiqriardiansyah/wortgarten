import { useQuery } from '@tanstack/react-query';
import { SenseDetailResponseSchema } from '@wortgarten/shared';
import { apiFetch } from '@/lib/apiClient';

export function useSenseDetail(senseId: string | null) {
  return useQuery({
    queryKey: ['lexicon', 'sense', senseId],
    queryFn: () => apiFetch(`/lexicon/sense/${encodeURIComponent(senseId!)}`, SenseDetailResponseSchema),
    enabled: senseId !== null,
  });
}
