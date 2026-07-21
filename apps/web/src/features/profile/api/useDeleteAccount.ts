import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { apiSend } from '@/lib/apiClient';

const DeleteAccountResultSchema = z.object({ success: z.literal(true) });

export function useDeleteAccount() {
  return useMutation({
    mutationFn: (confirmEmail: string) => apiSend('DELETE', '/me', DeleteAccountResultSchema, { confirmEmail }),
  });
}
