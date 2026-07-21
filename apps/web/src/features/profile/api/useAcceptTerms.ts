import { useMutation } from '@tanstack/react-query';
import { AcceptTermsResponseSchema } from '@wortgarten/shared';
import { apiSend } from '@/lib/apiClient';

export function useAcceptTerms() {
  return useMutation({
    mutationFn: (version: string) => apiSend('PATCH', '/me/accept-terms', AcceptTermsResponseSchema, { version }),
  });
}
