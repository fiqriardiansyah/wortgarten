import { StreakPill } from '@/components/ui/StreakPill';
import type { Streak } from '@wortgarten/shared';

interface GreetingHeaderProps {
  greeting: string;
  daySubtitle: string;
  streak: Streak;
}

export function GreetingHeader({ greeting, daySubtitle, streak }: GreetingHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold text-deep leading-tight">{greeting}</h1>
          <p className="mt-0.5 text-sm text-muted">{daySubtitle}</p>
        </div>
        {/* Desktop streak */}
        <div className="hidden lg:block">
          <StreakPill days={streak.current} />
        </div>
      </div>
      {streak.freezeSavedYesterday && (
        <p className="mt-3 rounded-card bg-lilac px-4 py-3 text-sm font-semibold text-deep" role="status">
          ❄️ A freeze saved your {streak.current}-day streak.
        </p>
      )}
    </div>
  );
}
