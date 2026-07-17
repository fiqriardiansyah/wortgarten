import { useMutation } from '@tanstack/react-query';
import { CreateSessionResponseSchema } from '@wortgarten/shared';
import { apiSend } from '@/lib/apiClient';

export function useRescueSession() {
  return useMutation({
    mutationFn: () => apiSend('POST', '/sessions/rescue', CreateSessionResponseSchema),
  });
}
