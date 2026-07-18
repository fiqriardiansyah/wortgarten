import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/Card';

interface TomorrowStoryCardProps {
  index: number;
}

/** GENERATING placeholder — deliberately not a Link/button. Nothing to tap yet. */
export function TomorrowStoryCard({ index }: TomorrowStoryCardProps) {
  return (
    <Card index={index} hover={false}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal-soft">
          <Sparkles size={18} className="text-teal" />
        </div>
        <div>
          <h3 className="font-bold text-ink">Tomorrow's story</h3>
          <p className="mt-0.5 text-sm text-muted">Generating tonight from your newest words</p>
        </div>
      </div>
    </Card>
  );
}
