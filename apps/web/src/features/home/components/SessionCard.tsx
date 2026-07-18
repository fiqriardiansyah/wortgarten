import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Play, Sprout } from 'lucide-react';
import type { SessionSummary } from '@wortgarten/shared';
import { useCreateSession } from '@/features/session/api/useCreateSession';

interface SessionCardProps {
  session: SessionSummary;
  index: number;
}

export function SessionCard({ session, index }: SessionCardProps) {
  const { wordCount, estMinutes, taskBreakdown, previewWords, isActive } = session;
  const { flashcards, recalls, sentenceBuilds } = taskBreakdown;
  const navigate = useNavigate();
  const createSession = useCreateSession();

  async function handleStart() {
    const result = await createSession.mutateAsync();
    if (result.kind === 'session') navigate('/session', { state: { session: result.session } });
  }

  // Fresh words are immediately due (addWord sets dueAt: now()), so wordCount === 0 here really
  // does mean "nothing to test" — the same signal /sessions itself uses. Celebrate it, don't
  // shrug: FSRS pushed these words out because the user knows them.
  if (wordCount === 0 && !isActive) {
    return (
      <Card tone="primary" index={index}>
        <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Today's session</p>
        <h2 className="mt-2 flex items-center gap-2 text-[28px] font-extrabold leading-tight text-white">
          <Sprout size={26} /> Nothing's due
        </h2>
        <p className="mt-2 text-sm text-white/80">Your words are sticking. German grows when you meet new ones.</p>
        <div className="mt-4">
          <Button variant="light" icon={<Play size={14} />} onClick={() => navigate('/add')}>
            + Add words
          </Button>
        </div>
      </Card>
    );
  }

  const wordLabel = `${wordCount} word${wordCount === 1 ? '' : 's'}`;
  const ctaLabel = isActive ? `Resume session · ${wordLabel} left` : `Start session · ${wordLabel}`;

  return (
    <Card tone="primary" index={index}>
      <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">Today's session</p>
      <h2 className="mt-2 text-[32px] font-extrabold text-white leading-tight">
        {isActive ? `${wordLabel} left` : `${wordLabel} waiting`}
      </h2>

      {!isActive && (
        <>
          <p className="mt-1 text-sm text-white/80">
            ≈ {estMinutes} min · {flashcards} flashcards · {recalls} recalls · {sentenceBuilds} sentence builds
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {previewWords.map((w) => (
              <Chip key={w} variant="lilac" style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.4)' }}>
                {w}
              </Chip>
            ))}
          </div>
        </>
      )}

      <div className="mt-4">
        <Button variant="light" pulse icon={<Play size={14} />} disabled={createSession.isPending} onClick={handleStart}>
          {ctaLabel}
        </Button>
      </div>
    </Card>
  );
}
