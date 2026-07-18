import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { usePracticeSession } from '@/features/session/api/usePracticeSession';
import type { ProblemWord } from '@wortgarten/shared';

interface ProblemChildrenCardProps {
  words: ProblemWord[];
  index: number;
}

export function ProblemChildrenCard({ words, index }: ProblemChildrenCardProps) {
  const practiceSession = usePracticeSession();
  const navigate = useNavigate();

  async function handlePracticeThese() {
    const result = await practiceSession.mutateAsync({
      size: words.length,
      userWordIds: words.map((w) => w.userWordId),
    });
    if (result.kind === 'session') navigate('/session', { state: { session: result.session } });
  }

  return (
    <Card index={index}>
      <h3 className="mb-3 font-bold text-ink">Your problem children 🤔</h3>

      {words.length === 0 ? (
        <p className="text-sm text-muted">No trouble words yet — keep drilling.</p>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {words.map((word) => (
              <div key={word.userWordId} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{word.displayForm}</p>
                  <p className="truncate text-xs text-muted">{word.translation}</p>
                </div>
                <Chip variant="lilac" className="flex-shrink-0">
                  {word.misses} miss{word.misses === 1 ? '' : 'es'}
                </Chip>
              </div>
            ))}
          </div>
          <Button
            className="mt-4 w-full justify-center"
            disabled={practiceSession.isPending}
            onClick={handlePracticeThese}
          >
            {practiceSession.isPending ? 'Starting…' : `Practice these ${words.length}`}
          </Button>
        </>
      )}
    </Card>
  );
}
