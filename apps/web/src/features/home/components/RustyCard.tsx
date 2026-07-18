import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AlertTriangle } from 'lucide-react';
import type { RustyGroup } from '@wortgarten/shared';
import { useRescueSession } from '@/features/session/api/useRescueSession';

interface RustyCardProps {
  rusty: RustyGroup;
  index: number;
}

export function RustyCard({ rusty, index }: RustyCardProps) {
  const { count, wordsPreview, extraCount } = rusty;
  const navigate = useNavigate();
  const rescueSession = useRescueSession();

  // Never offer a Rescue button with nothing to rescue.
  if (count === 0) return null;

  const preview = wordsPreview.join(', ') + (extraCount > 0 ? ` +${extraCount} more` : '');
  const headline = count === 1 ? '1 word is getting rusty' : `${count} words are getting rusty`;

  async function handleRescue() {
    const result = await rescueSession.mutateAsync();
    if (result.kind === 'session') navigate('/session', { state: { session: result.session } });
    else navigate('/add');
  }

  return (
    <Card index={index}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-coral-soft">
            <AlertTriangle size={18} className="text-coral" />
          </div>
          <div>
            <h3 className="font-bold text-ink">{headline}</h3>
            <p className="mt-0.5 text-sm text-muted">{preview}</p>
          </div>
        </div>
        <Button
          variant="coral"
          className="flex-shrink-0 text-xs px-4 py-2"
          disabled={rescueSession.isPending}
          onClick={handleRescue}
        >
          Rescue
        </Button>
      </div>
    </Card>
  );
}
