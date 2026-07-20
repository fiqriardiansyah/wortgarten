import { useNavigate } from 'react-router-dom';
import { Library } from 'lucide-react';
import type { Story } from '@wortgarten/shared';
import { Card } from '@/components/ui/Card';

interface EarlierStoriesSummaryCardProps {
  stories: Story[];
  index: number;
}

/** Mobile-only stand-in for the full "Earlier stories" masonry list (see ReadPage) — on a
 * narrow screen that list can run to dozens of cards and bury the reading-level/picked-up
 * cards below it, so mobile gets one compact card linking to the paginated /read/all page. */
export function EarlierStoriesSummaryCard({ stories, index }: EarlierStoriesSummaryCardProps) {
  const navigate = useNavigate();
  if (stories.length === 0) return null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate('/read/all')}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        navigate('/read/all');
      }}
      className="w-full text-left"
    >
      <Card index={index}>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal-soft">
            <Library size={18} className="text-teal" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-ink">Earlier stories</h3>
            <p className="mt-0.5 text-sm text-muted">
              {stories.length} {stories.length === 1 ? 'story' : 'stories'} · see all →
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
