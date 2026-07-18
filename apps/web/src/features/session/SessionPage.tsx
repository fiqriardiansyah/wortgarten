import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sprout } from 'lucide-react';
import type { DrillSessionResponse } from '@wortgarten/shared';
import { tokens } from '@/design/tokens';
import { fetchActiveSession } from './api/useActiveSession';
import { SessionShell } from './SessionShell';
import { useSessionStore } from './store';

/** Resumes on mount: a session passed via router state (the common path, from Home/Word detail's
 * "Start session" — no extra round trip) or, failing that, GET /sessions/active (a reload, a quit
 * and come back, even another device — same frozen plan, same order). No active session at all
 * means there's nothing to resume; bounce home rather than showing a dead screen. */
export function SessionPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const hydrate = useSessionStore((s) => s.hydrate);
  const sessionId = useSessionStore((s) => s.sessionId);
  const reset = useSessionStore((s) => s.reset);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    reset();
    const passed = (location.state as { session?: DrillSessionResponse } | null)?.session;
    if (passed) {
      hydrate(passed);
      setReady(true);
      return;
    }
    fetchActiveSession().then((session) => {
      if (session) {
        hydrate(session);
        setReady(true);
      } else {
        navigate('/', { replace: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready || !sessionId) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-2" style={{ backgroundColor: tokens.color.bg }}>
        <Sprout size={28} className="animate-pulse" style={{ color: tokens.color.teal }} />
        <p className="text-sm font-semibold text-muted">Loading…</p>
      </div>
    );
  }

  return <SessionShell />;
}
