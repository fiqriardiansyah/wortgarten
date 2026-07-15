import { StreakPill } from '@/components/ui/StreakPill';

interface GreetingHeaderProps {
  greeting: string;
  daySubtitle: string;
  streakDays: number;
}

export function GreetingHeader({ greeting, daySubtitle, streakDays }: GreetingHeaderProps) {
  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        <h1 className="text-[28px] font-extrabold text-deep leading-tight">{greeting}</h1>
        <p className="mt-0.5 text-sm text-muted">{daySubtitle}</p>
      </div>
      {/* Desktop streak */}
      <div className="hidden lg:block">
        <StreakPill days={streakDays} />
      </div>
    </div>
  );
}
