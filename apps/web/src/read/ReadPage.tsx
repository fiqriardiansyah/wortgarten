import { BookOpen } from 'lucide-react';
import { ZodError } from 'zod';
import { useLibrary } from '@/read/api/useLibrary';
import { HeroStoryCard } from '@/read/components/HeroStoryCard';
import { EarlierStoryCard } from '@/read/components/EarlierStoryCard';
import { TomorrowStoryCard } from '@/read/components/TomorrowStoryCard';
import { ReadingLevelCard } from '@/read/components/ReadingLevelCard';
import { PickedUpCard } from '@/read/components/PickedUpCard';

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-10 w-1/3 rounded-card bg-card/60" />
      <div className="h-56 rounded-card bg-card/60" />
      <div className="h-32 rounded-card bg-card/60" />
    </div>
  );
}

export function ReadPage() {
  const { data, isLoading, isError, error, refetch } = useLibrary();

  if (isLoading) return <Skeleton />;
  if (isError || !data) {
    // A parse failure (bad payload shape) is a different problem than a network/server error —
    // never collapse them into the same message, and never silently swallow the ZodError.
    if (error instanceof ZodError) console.error('Library failed shape validation', error);
    return (
      <div className="py-12 text-center text-muted">
        {error instanceof ZodError ? "Couldn't load your library — its data looks malformed." : 'Failed to load your library. Is the API running?'}{' '}
        <button onClick={() => refetch()} className="font-semibold text-primary hover:underline">
          Try again
        </button>
      </div>
    );
  }

  const { stories, readingLevel } = data;

  if (stories.length === 0) {
    return (
      <div>
        <h1 className="text-[28px] font-extrabold leading-tight text-deep">Read</h1>
        <div className="mt-8 py-12 text-center text-muted">
          Your first story is brewing — add a few words and check back.
        </div>
      </div>
    );
  }

  const hero = stories.find((story) => story.isNewToday) ?? stories.find((story) => story.status === 'READY');
  const generating = stories.find((story) => story.status === 'GENERATING');
  const earlier = stories.filter((story) => story.status === 'READY' && story.id !== hero?.id);
  const readCount = stories.filter((story) => story.isRead).length;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight text-deep">Read</h1>
          <p className="mt-0.5 text-sm text-muted">Stories written from the words you know</p>
        </div>
        <span className="flex flex-shrink-0 items-center gap-1.5 rounded-pill bg-card px-3 py-1.5 text-xs font-bold text-deep shadow-card">
          <BookOpen size={14} className="text-primary" /> {readCount} stories read
        </span>
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-5">
        {/* Left column */}
        <div className="flex flex-col gap-5">
          {hero && <HeroStoryCard story={hero} index={0} />}

          {earlier.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-bold text-deep">Earlier stories</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {earlier.map((story, i) => (
                  <EarlierStoryCard key={story.id} story={story} index={i + 1} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right rail (desktop) */}
        <div className="mt-5 flex flex-col gap-4 lg:mt-0">
          {generating && <TomorrowStoryCard index={0} />}
          <ReadingLevelCard level={readingLevel} index={1} />
          <PickedUpCard stories={stories} index={2} />
        </div>
      </div>
    </div>
  );
}
