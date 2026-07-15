import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SessionCompleteResponseSchema } from '@wortgarten/shared';
import { apiSend } from '@/lib/apiClient';

export function useCompleteSession(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend('POST', `/sessions/${sessionId}/complete`, SessionCompleteResponseSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home'] });
      queryClient.invalidateQueries({ queryKey: ['words'] });
    },
  });
}
