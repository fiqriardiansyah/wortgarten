import { DrillSessionResponseSchema, type DrillSessionResponse } from '@wortgarten/shared';
import { apiFetch } from '@/lib/apiClient';

/** Plain fetch, not a TanStack query — SessionPage calls this once on mount to resume, then hands
 * the result to the Zustand store, which owns in-flight walking state from then on. */
export async function fetchActiveSession(): Promise<DrillSessionResponse | null> {
  try {
    return await apiFetch('/sessions/active', DrillSessionResponseSchema);
  } catch {
    return null;
  }
}
