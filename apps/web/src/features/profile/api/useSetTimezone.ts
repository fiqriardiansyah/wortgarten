import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SetTimezoneResponseSchema } from '@wortgarten/shared';
import { apiSend } from '@/lib/apiClient';

export function useSetTimezone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (timezone: string) => apiSend('PATCH', '/me/timezone', SetTimezoneResponseSchema, { timezone }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['home'] });
      queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}
