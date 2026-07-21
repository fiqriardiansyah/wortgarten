import { useQuery } from '@tanstack/react-query';
import { authClient } from '@/lib/authClient';

export type SignInMethod = 'google' | 'email';

/** Wraps Better Auth's core `/list-accounts` route — no backend work needed, it ships with the
 * auth client. Used to tell Google vs email/password accounts apart (users forget which they used). */
export function useAccountsQuery() {
  return useQuery({
    queryKey: ['profile', 'accounts'],
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts();
      if (error) throw new Error(error.message ?? 'Could not load linked accounts');
      return data ?? [];
    },
    select: (accounts) => {
      const providerIds = accounts.map((a) => a.providerId);
      const signInMethod: SignInMethod = providerIds.includes('google') ? 'google' : 'email';
      const hasCredential = providerIds.includes('credential');
      return { accounts, signInMethod, hasCredential };
    },
  });
}
