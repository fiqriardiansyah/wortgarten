import { BookOpen } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { tokens } from '@/design/tokens';

interface WaitingTomorrowCardProps {
  index: number;
}

/** Today's one new story is already read — next one only unlocks at the user's local midnight.
 * Deliberately not a Link/button, no percentage, no minutes, no chevron: reads as anticipation,
 * not a lockout. Earlier stories stay one tap away in the main column regardless. */
export function WaitingTomorrowCard({ index }: WaitingTomorrowCardProps) {
  return (
    <Card index={index} hover={false} stroke={tokens.color.teal}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal-soft">
          <BookOpen size={18} className="text-teal" />
        </div>
        <div>
          <h3 className="font-bold text-ink">Today's story is done</h3>
          <p className="mt-0.5 text-sm text-muted">New story tomorrow</p>
        </div>
      </div>
    </Card>
  );
}
