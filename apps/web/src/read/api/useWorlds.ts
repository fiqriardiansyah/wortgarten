import { useQuery } from '@tanstack/react-query';
import { WorldsResponseSchema } from '@wortgarten/shared';
import { apiFetch } from '@/lib/apiClient';

export function useWorlds() {
  return useQuery({
    queryKey: ['worlds'],
    queryFn: () => apiFetch('/worlds', WorldsResponseSchema),
  });
}

/** Story attribution ("🏠 At home") looks up {name, icon} from the same worlds list the Worlds
 * card already fetches — React Query dedupes the identical `['worlds']` query, so this never
 * costs a second network round trip when both are mounted, and degrades to null quietly (no
 * crash, no placeholder chip) before the list has loaded or for a null worldKey. */
export function useWorldAttribution(worldKey: string | null) {
  const { data } = useWorlds();
  if (!worldKey || !data) return null;
  return data.worlds.find((w) => w.key === worldKey) ?? null;
}
