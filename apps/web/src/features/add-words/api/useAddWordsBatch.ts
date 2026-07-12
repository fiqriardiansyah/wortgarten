import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AddWordsBatchResponseSchema, type AddWordSourceType } from '@wortgarten/shared';
import { apiSend } from '@/lib/apiClient';

interface BatchInput {
  items: { senseId: string; sourceSentence?: string }[];
  sourceType?: AddWordSourceType;
}

export function useAddWordsBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BatchInput) => apiSend('POST', '/words/batch', AddWordsBatchResponseSchema, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['words'] });
      queryClient.invalidateQueries({ queryKey: ['home'] });
    },
  });
}
