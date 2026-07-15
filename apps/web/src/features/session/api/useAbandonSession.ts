import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { apiSend } from '@/lib/apiClient';

const AbandonResultSchema = z.object({ id: z.string() });

export function useAbandonSession(sessionId: string) {
  return useMutation({
    mutationFn: () => apiSend('POST', `/sessions/${sessionId}/abandon`, AbandonResultSchema),
  });
}
