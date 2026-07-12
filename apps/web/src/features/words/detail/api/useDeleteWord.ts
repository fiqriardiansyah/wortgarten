import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiSend } from '@/lib/apiClient';

const DeleteWordResultSchema = z.object({ id: z.string() });

export function useDeleteWord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiSend('DELETE', `/words/${id}`, DeleteWordResultSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['words'] });
      queryClient.invalidateQueries({ queryKey: ['home'] });
    },
  });
}
