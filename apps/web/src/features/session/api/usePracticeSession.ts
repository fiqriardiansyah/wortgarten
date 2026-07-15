import { useMutation } from '@tanstack/react-query';
import { CreateSessionResponseSchema, type PracticeSessionRequest } from '@wortgarten/shared';
import { apiSend } from '@/lib/apiClient';

export function usePracticeSession() {
  return useMutation({
    mutationFn: (input: PracticeSessionRequest) => apiSend('POST', '/sessions/practice', CreateSessionResponseSchema, input),
  });
}
