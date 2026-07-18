import { Card } from '@/components/ui/Card';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { LinearProgress } from '@/components/ui/LinearProgress';
import type { Quest } from '@wortgarten/shared';

interface QuestCardProps {
  quest: Quest;
  index: number;
}

export function QuestCard({ quest, index }: QuestCardProps) {
  const { label, current, target, rewardLabel } = quest;

  return (
    <Card index={index}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">🎯</span>
        <h3 className="font-bold text-ink">{label}</h3>
      </div>

      {/* Desktop: ring */}
      <div className="hidden lg:flex justify-center py-2">
        <ProgressRing value={current} max={target} size={96}>
          <span className="text-sm font-bold text-ink">
            {current}/{target}
          </span>
        </ProgressRing>
      </div>

      {/* Mobile: linear */}
      <div className="lg:hidden">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="font-semibold text-ink">{current} of {target}</span>
          <span>⭐</span>
        </div>
        <LinearProgress value={current} max={target} />
      </div>

      <p className="mt-3 text-sm text-muted">{rewardLabel}</p>
    </Card>
  );
}
