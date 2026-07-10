import { useHomeQuery } from './api/useHomeQuery';
import { GreetingHeader } from './components/GreetingHeader';
import { SessionCard } from './components/SessionCard';
import { RustyCard } from './components/RustyCard';
import { StoryCard } from './components/StoryCard';
import { QuestCard } from './components/QuestCard';
import { GardenCard } from './components/GardenCard';
import { RecentlyAddedCard } from './components/RecentlyAddedCard';

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-16 w-2/3 rounded-card bg-card/60" />
      <div className="h-48 rounded-card bg-card/60" />
      <div className="h-24 rounded-card bg-card/60" />
      <div className="h-24 rounded-card bg-card/60" />
    </div>
  );
}

export function HomePage() {
  const { data, isLoading, isError } = useHomeQuery();

  if (isLoading) return <Skeleton />;
  if (isError || !data) {
    return (
      <div className="py-12 text-center text-muted">
        Failed to load dashboard. Is the API running?
      </div>
    );
  }

  return (
    <div>
      <GreetingHeader
        greeting={data.greeting}
        daySubtitle={data.daySubtitle}
        streakDays={data.streakDays}
        userName={data.user.name}
      />

      {/* Desktop: two-column grid */}
      <div className="hidden lg:grid lg:grid-cols-[1fr_360px] lg:gap-5">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          <SessionCard session={data.session} index={0} />
          <RustyCard rusty={data.rusty} index={1} />
          <StoryCard story={data.story} index={2} />
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          <QuestCard quest={data.quest} index={0} />
          <GardenCard garden={data.garden} index={1} />
          <RecentlyAddedCard words={data.recentlyAdded} index={2} />
        </div>
      </div>

      {/* Mobile: single column */}
      <div className="flex flex-col gap-4 lg:hidden">
        <SessionCard session={data.session} index={0} />
        <RustyCard rusty={data.rusty} index={1} />
        <QuestCard quest={data.quest} index={2} />
        <GardenCard garden={data.garden} index={3} />
        <StoryCard story={data.story} index={4} />
        <RecentlyAddedCard words={data.recentlyAdded} index={5} />
      </div>
    </div>
  );
}
