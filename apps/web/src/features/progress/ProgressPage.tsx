import { useProgressQuery } from './api/useProgressQuery';
import { ProgressHeader } from './components/ProgressHeader';
import { GardenHeroCard } from './components/GardenHeroCard';
import { MilestonesCard } from './components/MilestonesCard';
import { ConsistencyCard } from './components/ConsistencyCard';
import { ProblemChildrenCard } from './components/ProblemChildrenCard';
import { GrowthCard } from './components/GrowthCard';
import { StreakDetailCard } from './components/StreakDetailCard';

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-10 w-1/2 rounded-sketch bg-card/60" />
      <div className="h-40 rounded-sketch bg-card/60" />
      <div className="h-40 rounded-sketch bg-card/60" />
      <div className="h-40 rounded-sketch bg-card/60" />
    </div>
  );
}

export function ProgressPage() {
  const { data, isLoading, isError } = useProgressQuery();

  if (isLoading) return <Skeleton />;
  if (isError || !data) {
    return <div className="py-12 text-center text-muted">Failed to load progress. Is the API running?</div>;
  }

  return (
    <div>
      <ProgressHeader daySubtitle={data.daySubtitle} />

      {/* Desktop: two-column grid */}
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-5">
        <div className="flex flex-col gap-4">
          <GardenHeroCard garden={data.garden} index={0} />
          <MilestonesCard collected={data.garden.collected} index={1} />
          <GrowthCard growth={data.growth} index={2} />
        </div>
        <div className="flex flex-col gap-4">
          <StreakDetailCard week={data.streakWeek} streak={data.streak} index={0} />
          <ConsistencyCard streak={data.streak} index={1} />
          <ProblemChildrenCard words={data.problemWords} index={2} />
        </div>
      </div>

      {/* Mobile: single column */}
      <div className="flex flex-col gap-4 lg:hidden">
        <GardenHeroCard garden={data.garden} index={0} />
        <StreakDetailCard week={data.streakWeek} streak={data.streak} index={1} />
        <MilestonesCard collected={data.garden.collected} index={2} />
        <ConsistencyCard streak={data.streak} index={3} />
        <ProblemChildrenCard words={data.problemWords} index={4} />
        <GrowthCard growth={data.growth} index={5} />
      </div>
    </div>
  );
}
