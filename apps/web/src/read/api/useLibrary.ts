import { useQuery } from '@tanstack/react-query';
import { LibraryResponseSchema } from '@wortgarten/shared';
import { apiFetch } from '@/lib/apiClient';

export function useLibrary() {
  return useQuery({
    queryKey: ['read', 'library'],
    queryFn: () => apiFetch('/stories', LibraryResponseSchema),
  });
}
