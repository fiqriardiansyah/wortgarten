import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiSend } from '@/lib/apiClient';

const UpdateWordResultSchema = z.object({ id: z.string() });

interface UpdateWordInput {
  id: string;
  customTranslation?: string | null;
  note?: string | null;
}

export function useUpdateWord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: UpdateWordInput) => apiSend('PATCH', `/words/${id}`, UpdateWordResultSchema, data),
    onSuccess: (_result, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['words', 'detail', id] });
      queryClient.invalidateQueries({ queryKey: ['words'] });
    },
  });
}
