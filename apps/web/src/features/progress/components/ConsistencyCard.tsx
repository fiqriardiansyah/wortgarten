import { Card } from '@/components/ui/Card';
import type { ProgressStreak } from '@wortgarten/shared';

interface ConsistencyCardProps {
  streak: ProgressStreak;
  index: number;
}

const STATS = [
  { key: 'current', label: 'current streak', color: 'text-primary' },
  { key: 'longest', label: 'longest', color: 'text-deep' },
  { key: 'totalLearningDays', label: 'total days', color: 'text-deep' },
] as const;

export function ConsistencyCard({ streak, index }: ConsistencyCardProps) {
  const freezesLeft = streak.freezesBanked;

  return (
    <Card index={index}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Consistency</p>

      <div className="flex gap-6">
        {STATS.map((stat) => (
          <div key={stat.key} className="flex flex-col items-center">
            <span className={`text-2xl font-extrabold ${stat.color}`}>{streak[stat.key]}</span>
            <span className="mt-0.5 text-center text-[11px] text-muted">{stat.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {streak.calendar.map((day) => (
          <div
            key={day.date}
            title={day.date}
            className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] ${
              day.state === 'completed' ? 'bg-success' : day.state === 'frozen' ? 'bg-lilac' : 'bg-gray-100'
            }`}
          >
            {day.state === 'frozen' && '❄️'}
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted">
        {freezesLeft > 0
          ? `❄️ ${freezesLeft} freeze day${freezesLeft === 1 ? '' : 's'} left — a missed day won't break you`
          : 'Learn 7 days in a row to bank a freeze day'}
      </p>
    </Card>
  );
}
