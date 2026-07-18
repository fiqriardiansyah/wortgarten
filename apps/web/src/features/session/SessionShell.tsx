import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SessionCompleteResponse, TaskResponse } from '@wortgarten/shared';
import { Button } from '@/components/ui/Button';
import { LinearProgress } from '@/components/ui/LinearProgress';
import { tokens } from '@/design/tokens';
import { fetchActiveSession } from './api/useActiveSession';
import { useAbandonSession } from './api/useAbandonSession';
import { useCompleteSession } from './api/useCompleteSession';
import { useCreateSession } from './api/useCreateSession';
import { usePracticeSession } from './api/usePracticeSession';
import { useSubmitAttempt } from './api/useSubmitAttempt';
import { CorrectionCard } from './CorrectionCard';
import { SessionSummary } from './SessionSummary';
import { useSessionStore } from './store';
import { BuildSentenceTask } from './tasks/BuildSentenceTask';
import { PickMeaningTask } from './tasks/PickMeaningTask';
import { TypeWordTask } from './tasks/TypeWordTask';

function FullscreenLayout({
  children,
  onExit,
  progress,
  total,
}: {
  children: ReactNode;
  onExit?: () => void;
  progress?: number;
  total?: number;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto" style={{ backgroundColor: tokens.color.bg }}>
      <div className="flex items-center gap-4 px-4 py-4">
        {onExit ? (
          <button type="button" onClick={onExit} aria-label="Exit session" className="text-2xl text-muted hover:text-ink">
            ✕
          </button>
        ) : (
          <div className="w-6" />
        )}
        <div className="flex-1">{total !== undefined && progress !== undefined && <LinearProgress value={progress} max={total} />}</div>
        {total !== undefined && progress !== undefined && (
          <span className="text-sm font-semibold text-muted">
            {Math.min(progress, total)}/{total}
          </span>
        )}
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-10">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}

/** Fullscreen drill player — screens 1-5. The frontend never grades; it renders `task.taskType`
 * and posts answers, walking the server-authoritative plan. */
export function SessionShell() {
  const store = useSessionStore();
  const navigate = useNavigate();
  const submitAttempt = useSubmitAttempt(store.sessionId ?? '');
  const completeSession = useCompleteSession(store.sessionId ?? '');
  const abandonSession = useAbandonSession(store.sessionId ?? '');
  const createSession = useCreateSession();
  const practiceSession = usePracticeSession();

  const [pickSelected, setPickSelected] = useState<string | null>(null);
  const [typedText, setTypedText] = useState('');
  const [tileIds, setTileIds] = useState<string[]>([]);
  const [summary, setSummary] = useState<SessionCompleteResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const task = store.tasks[store.currentIndex];
  const finished = !task && store.phase === 'task';

  useEffect(() => {
    setPickSelected(null);
    setTypedText('');
    setTileIds([]);
  }, [task?.id]);

  useEffect(() => {
    if (finished && store.sessionId && !summary && !completeSession.isPending) {
      completeSession.mutateAsync().then(setSummary).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, store.sessionId]);

  async function submitResponse(response: TaskResponse) {
    if (!store.sessionId || !task) return;
    const responseTimeMs = Date.now() - store.taskStartedAtMs;
    const result = await submitAttempt.mutateAsync({ planItemId: task.id, response, responseTimeMs });
    store.applyAttempt(result);
  }

  function handlePickSelect(senseId: string) {
    setPickSelected(senseId);
    void submitResponse({ taskType: 'PICK_MEANING', chosenSenseId: senseId });
  }

  function handleCheck() {
    if (!task) return;
    if (task.taskType === 'TYPE_WORD') void submitResponse({ taskType: 'TYPE_WORD', text: typedText });
    else if (task.taskType === 'BUILD_SENTENCE') void submitResponse({ taskType: 'BUILD_SENTENCE', tileIds });
  }

  async function handleGotIt() {
    if (store.lastAttempt?.requeued) {
      const fresh = await fetchActiveSession();
      if (fresh) store.hydrate(fresh);
    } else {
      store.continueAfterCorrection();
    }
  }

  async function handleExit() {
    if (!window.confirm('Your progress is saved. Exit this session?')) return;
    if (store.sessionId) await abandonSession.mutateAsync();
    navigate('/', { replace: true });
  }

  async function handleStartNext() {
    const result = await createSession.mutateAsync();
    if (result.kind === 'session') {
      store.hydrate(result.session);
      setSummary(null);
    } else {
      navigate('/', { replace: true });
    }
  }

  async function handlePracticeMore() {
    if (!summary) return;
    const result = await practiceSession.mutateAsync({ size: summary.practiceCount });
    if (result.kind === 'session') {
      store.hydrate(result.session);
      setSummary(null);
    } else {
      navigate('/', { replace: true });
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (summary) return;
      if (event.key === 'Escape') {
        void handleExit();
        return;
      }
      if (store.phase === 'correction') {
        if (event.key === 'Enter') void handleGotIt();
        return;
      }
      if (!task) return;
      if (task.taskType === 'PICK_MEANING' && /^[1-4]$/.test(event.key)) {
        const option = task.payload.options[Number(event.key) - 1];
        if (option) handlePickSelect(option.senseId);
        return;
      }
      if (event.key === 'Enter') handleCheck();
      if (event.key === 'Backspace' && task.taskType === 'BUILD_SENTENCE') {
        setTileIds((ids) => ids.slice(0, -1));
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (summary) {
    return (
      <FullscreenLayout>
        <SessionSummary
          summary={summary}
          onStartNext={handleStartNext}
          startNextPending={createSession.isPending}
          onPracticeMore={handlePracticeMore}
          practicePending={practiceSession.isPending}
        />
      </FullscreenLayout>
    );
  }

  if (finished || !task) {
    return (
      <FullscreenLayout>
        <p className="text-center text-muted">Finishing up…</p>
      </FullscreenLayout>
    );
  }

  const userAnswerLabel =
    task.taskType === 'TYPE_WORD' ? typedText : task.taskType === 'PICK_MEANING' ? task.payload.options.find((o) => o.senseId === pickSelected)?.label : undefined;

  return (
    <FullscreenLayout onExit={handleExit} progress={store.practicedCount} total={store.totalCount}>
      {store.phase === 'correction' && store.lastAttempt ? (
        <CorrectionCard userAnswerLabel={userAnswerLabel} attempt={store.lastAttempt} onGotIt={handleGotIt} />
      ) : (
        <>
          {task.taskType === 'PICK_MEANING' && (
            <PickMeaningTask payload={task.payload} disabled={submitAttempt.isPending} onSelect={handlePickSelect} />
          )}
          {task.taskType === 'TYPE_WORD' && (
            <>
              <TypeWordTask payload={task.payload} value={typedText} disabled={submitAttempt.isPending} inputRef={inputRef} onChange={setTypedText} />
              <Button className="mt-4 w-full justify-center" disabled={submitAttempt.isPending} onPointerDown={handleCheck}>
                Check ✓
              </Button>
            </>
          )}
          {task.taskType === 'BUILD_SENTENCE' && (
            <>
              <BuildSentenceTask payload={task.payload} selectedIds={tileIds} disabled={submitAttempt.isPending} onChange={setTileIds} />
              <Button className="mt-4 w-full justify-center" disabled={submitAttempt.isPending} onPointerDown={handleCheck}>
                Check ✓
              </Button>
            </>
          )}
        </>
      )}
    </FullscreenLayout>
  );
}
