import { Check, Lock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { MILESTONES } from '../milestones';

interface MilestonesCardProps {
  collected: number;
  index: number;
}

export function MilestonesCard({ collected, index }: MilestonesCardProps) {
  const firstNotDoneIndex = MILESTONES.findIndex((m) => collected < m.threshold);

  return (
    <Card index={index}>
      <h3 className="mb-3 font-bold text-deep">What you can do</h3>
      <div className="flex flex-col gap-2">
        {MILESTONES.map((milestone, i) => {
          const status: 'done' | 'current' | 'locked' =
            firstNotDoneIndex === -1 || i < firstNotDoneIndex ? 'done' : i === firstNotDoneIndex ? 'current' : 'locked';
          const remaining = milestone.threshold - collected;

          return (
            <div
              key={milestone.threshold}
              className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ${status === 'current' ? 'bg-lilac' : ''}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
                    status === 'done'
                      ? 'bg-primary/10 text-primary'
                      : status === 'current'
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-muted'
                  }`}
                >
                  {status === 'done' ? <Check size={15} /> : status === 'locked' ? <Lock size={12} /> : <span className="text-[10px] font-bold">★</span>}
                </span>
                <div className="min-w-0">
                  <p className={`text-sm font-bold ${status === 'locked' ? 'text-muted' : 'text-deep'}`}>{milestone.threshold} words</p>
                  <p className="truncate text-xs text-muted">{milestone.payoff}</p>
                </div>
              </div>
              {status === 'current' && <span className="flex-shrink-0 text-xs font-bold text-primary">{remaining} to go</span>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
