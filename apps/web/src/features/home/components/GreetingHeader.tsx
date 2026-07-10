import { Avatar } from '@/components/ui/Avatar';
import { StreakPill } from '@/components/ui/StreakPill';

interface GreetingHeaderProps {
  greeting: string;
  daySubtitle: string;
  streakDays: number;
  userName: string;
}

export function GreetingHeader({ greeting, daySubtitle, streakDays, userName }: GreetingHeaderProps) {
  return (
    <>
      {/* Mobile header row */}
      <div className="mb-4 flex items-center justify-between lg:hidden">
        <Avatar name={userName} size="md" />
        <StreakPill days={streakDays} compact />
      </div>

      {/* Greeting row */}
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
    </>
  );
}
