import { create } from 'zustand';
import type { DrillSessionResponse, SessionTask, SubmitAttemptResponse } from '@wortgarten/shared';

type Phase = 'task' | 'correction';

interface SessionStoreState {
  sessionId: string | null;
  tasks: SessionTask[];
  totalCount: number;
  practicedCount: number;
  currentIndex: number;
  isPractice: boolean;
  startedAtMs: number | null;
  taskStartedAtMs: number;
  phase: Phase;
  lastAttempt: SubmitAttemptResponse | null;

  hydrate: (session: DrillSessionResponse) => void;
  applyAttempt: (response: SubmitAttemptResponse) => void;
  continueAfterCorrection: () => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  sessionId: null,
  tasks: [],
  totalCount: 0,
  practicedCount: 0,
  currentIndex: 0,
  isPractice: false,
  startedAtMs: null,
  taskStartedAtMs: Date.now(),
  phase: 'task',
  lastAttempt: null,

  hydrate: (session) =>
    set({
      sessionId: session.id,
      tasks: session.tasks,
      totalCount: session.totalCount,
      practicedCount: session.practicedCount,
      currentIndex: session.currentIndex,
      isPractice: session.isPractice,
      startedAtMs: Date.parse(session.startedAt),
      taskStartedAtMs: Date.now(),
      phase: 'task',
      lastAttempt: null,
    }),

  applyAttempt: (response) => {
    if (response.result === 'CORRECT') {
      set({
        practicedCount: response.practicedCount,
        currentIndex: response.currentIndex,
        phase: 'task',
        taskStartedAtMs: Date.now(),
        lastAttempt: response,
      });
    } else {
      set({ practicedCount: response.practicedCount, lastAttempt: response, phase: 'correction' });
    }
  },

  /** Called when the user taps "Got it →" on a non-requeued correction (e.g. CORRECT_WITH_TYPO).
   * When the answer DID requeue, the caller calls `hydrate()` with a fresh GET /sessions/active
   * instead — refetching is simpler and just as correct as mirroring the server's splice position
   * client-side, and it's how the newly-inserted retry task reaches the local `tasks` array. */
  continueAfterCorrection: () => {
    const { lastAttempt, tasks } = get();
    if (!lastAttempt) return;
    set({
      currentIndex: Math.min(lastAttempt.currentIndex, tasks.length - 1),
      phase: 'task',
      taskStartedAtMs: Date.now(),
    });
  },

  reset: () =>
    set({
      sessionId: null,
      tasks: [],
      totalCount: 0,
      practicedCount: 0,
      currentIndex: 0,
      isPractice: false,
      startedAtMs: null,
      phase: 'task',
      lastAttempt: null,
    }),
}));
