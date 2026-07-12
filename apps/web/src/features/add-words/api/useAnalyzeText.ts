import { useMutation } from '@tanstack/react-query';
import { AnalyzeResponseSchema } from '@wortgarten/shared';
import { apiSend } from '@/lib/apiClient';

export function useAnalyzeText() {
  return useMutation({
    mutationFn: (text: string) => apiSend('POST', '/lexicon/analyze', AnalyzeResponseSchema, { text }),
  });
}
