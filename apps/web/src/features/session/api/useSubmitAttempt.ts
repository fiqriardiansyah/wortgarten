import { useMutation } from '@tanstack/react-query';
import { SubmitAttemptResponseSchema, type SubmitAttemptRequest } from '@wortgarten/shared';
import { apiSend } from '@/lib/apiClient';

/** Idempotent on (drillSessionId, planItemId) server-side, so a network retry is always safe —
 * this is what lets us turn mutation retries on (off by default in TanStack Query). */
export function useSubmitAttempt(sessionId: string) {
  return useMutation({
    retry: 3,
    mutationFn: (input: SubmitAttemptRequest) => apiSend('POST', `/sessions/${sessionId}/attempts`, SubmitAttemptResponseSchema, input),
  });
}
