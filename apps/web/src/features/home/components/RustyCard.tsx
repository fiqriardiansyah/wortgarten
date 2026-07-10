import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AlertTriangle } from 'lucide-react';
import type { RustyGroup } from '@wortgarten/shared';

interface RustyCardProps {
  rusty: RustyGroup;
  index: number;
}

export function RustyCard({ rusty, index }: RustyCardProps) {
  const { count, wordsPreview, extraCount } = rusty;
  const preview = wordsPreview.join(', ') + (extraCount > 0 ? ` +${extraCount} more` : '');

  return (
    <Card index={index}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-coral/10">
            <AlertTriangle size={18} className="text-coral" />
          </div>
          <div>
            <h3 className="font-bold text-deep">{count} words are getting rusty</h3>
            <p className="mt-0.5 text-sm text-muted">{preview}</p>
          </div>
        </div>
        <Button variant="coral" className="flex-shrink-0 text-xs px-4 py-2">
          Rescue
        </Button>
      </div>
    </Card>
  );
}
