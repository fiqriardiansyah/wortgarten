import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AddWordResponseSchema, LexiconSearchResponseSchema, type LexiconSearchResponse } from '@wortgarten/shared';
import type { AddWordSourceType } from '@wortgarten/shared';
import { apiSend } from '@/lib/apiClient';

interface AddWordInput {
  senseId: string;
  sourceSentence?: string;
  sourceType?: AddWordSourceType;
}

function markInBank(data: LexiconSearchResponse, senseId: string): LexiconSearchResponse {
  return {
    results: data.results.map((result) => ({
      ...result,
      senses: result.senses.map((sense) => (sense.id === senseId ? { ...sense, inBank: true } : sense)),
    })),
  };
}

export function useAddWord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AddWordInput) => apiSend('POST', '/words', AddWordResponseSchema, input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['lexicon-search'] });
      const previous = queryClient.getQueriesData<LexiconSearchResponse>({ queryKey: ['lexicon-search'] });
      queryClient.setQueriesData<LexiconSearchResponse>({ queryKey: ['lexicon-search'] }, (data) =>
        data ? markInBank(data, input.senseId) : data,
      );
      return { previous };
    },
    onError: (_err, _input, context) => {
      context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['lexicon-search'] });
      queryClient.invalidateQueries({ queryKey: ['words'] });
      queryClient.invalidateQueries({ queryKey: ['home'] });
    },
  });
}
