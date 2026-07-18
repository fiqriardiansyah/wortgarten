import { Check, Lock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { IllustrationSlot } from '@/components/ui/IllustrationSlot';
import { MILESTONES } from '../milestones';

interface MilestonesCardProps {
  collected: number;
  index: number;
}

export function MilestonesCard({ collected, index }: MilestonesCardProps) {
  const firstNotDoneIndex = MILESTONES.findIndex((m) => collected < m.threshold);
  const hasUnlocked = firstNotDoneIndex !== 0;

  return (
    <Card index={index}>
      <h3 className="mb-3 font-bold text-ink">What you can do</h3>
      {hasUnlocked && <IllustrationSlot label="milestone unlocked" height={100} className="mb-3" />}
      <div className="flex flex-col gap-2">
        {MILESTONES.map((milestone, i) => {
          const status: 'done' | 'current' | 'locked' =
            firstNotDoneIndex === -1 || i < firstNotDoneIndex ? 'done' : i === firstNotDoneIndex ? 'current' : 'locked';
          const remaining = milestone.threshold - collected;

          return (
            <div
              key={milestone.threshold}
              className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ${status === 'current' ? 'bg-teal-soft' : ''}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
                    status === 'done'
                      ? 'bg-teal-soft text-teal-deep'
                      : status === 'current'
                        ? 'bg-teal text-white'
                        : 'bg-line-soft text-muted'
                  }`}
                >
                  {status === 'done' ? <Check size={15} /> : status === 'locked' ? <Lock size={12} /> : <span className="text-[10px] font-bold">★</span>}
                </span>
                <div className="min-w-0">
                  <p className={`text-sm font-bold ${status === 'locked' ? 'text-muted' : 'text-ink'}`}>{milestone.threshold} words</p>
                  <p className="truncate text-xs text-muted">{milestone.payoff}</p>
                </div>
              </div>
              {status === 'current' && <span className="flex-shrink-0 text-xs font-bold text-teal">{remaining} to go</span>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
