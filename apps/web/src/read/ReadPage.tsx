import { BookOpen, Sparkles } from 'lucide-react';
import { ZodError } from 'zod';
import Measure from 'react-measure';
import Masonry from 'react-responsive-masonry';
import { tokens } from '@/design/tokens';
import { useGenerateStoryDev, useLibrary } from '@/read/api/useLibrary';
import { HeroStoryCard } from '@/read/components/HeroStoryCard';
import { EarlierStoryCard } from '@/read/components/EarlierStoryCard';
import { EarlierStoriesSummaryCard } from '@/read/components/EarlierStoriesSummaryCard';
import { TomorrowStoryCard } from '@/read/components/TomorrowStoryCard';
import { WaitingTomorrowCard } from '@/read/components/WaitingTomorrowCard';
import { ReadingLevelCard } from '@/read/components/ReadingLevelCard';
import { PickedUpCard } from '@/read/components/PickedUpCard';

const TWO_COLUMN_MIN_WIDTH = 480;

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-10 w-1/3 rounded-sketch bg-card/60" />
      <div className="h-56 rounded-sketch bg-card/60" />
      <div className="h-32 rounded-sketch bg-card/60" />
    </div>
  );
}

/** DEVELOPMENT ONLY — manually fires story generation, bypassing the one-per-day/unread gate.
 * `import.meta.env.DEV` is Vite's build-time flag, so this never ships in a production bundle. */
function DevGenerateStoryButton() {
  const generate = useGenerateStoryDev();
  if (!import.meta.env.DEV) return null;

  return (
    <button
      onClick={() => generate.mutate()}
      disabled={generate.isPending}
      title="DEV ONLY: force-generate a new story"
      className="flex flex-shrink-0 items-center gap-1.5 rounded-pill border-2 border-dashed border-line bg-surface px-3 py-1.5 text-xs font-bold text-ink transition-colors hover:border-teal disabled:opacity-50"
    >
      <Sparkles size={14} style={{ color: tokens.color.teal }} />
      {generate.isPending ? 'Generating…' : 'Generate story (dev)'}
    </button>
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
        <button onClick={() => refetch()} className="font-semibold text-teal hover:underline">
          Try again
        </button>
      </div>
    );
  }

  const { stories, readingLevel, pendingState } = data;

  if (stories.length === 0) {
    return (
      <div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-[28px] font-extrabold leading-tight text-ink">Read</h1>
          <DevGenerateStoryButton />
        </div>
        <div className="mt-8 py-12 text-center text-muted">
          Your first story is brewing — add a few words and check back.
        </div>
      </div>
    );
  }

  const hero = stories.find((story) => story.isNewToday) ?? stories.find((story) => story.status === 'READY');
  const earlier = stories.filter((story) => story.status === 'READY' && story.id !== hero?.id);
  const readCount = stories.filter((story) => story.isRead).length;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold leading-tight text-ink">Read</h1>
          <p className="mt-0.5 text-sm text-muted">Stories written from the words you know</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0 sm:flex-nowrap">
          <DevGenerateStoryButton />
          <span className="flex items-center gap-1.5 rounded-pill border-2 border-line bg-surface px-3 py-1.5 text-xs font-bold text-ink">
            <BookOpen size={14} style={{ color: tokens.color.teal }} /> {readCount} stories read
          </span>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-5">
        {/* Left column */}
        <div className="flex flex-col gap-5">
          {hero && <HeroStoryCard story={hero} index={0} />}

          {earlier.length > 0 && (
            <>
              {/* Mobile: one compact card linking to the paginated /read/all page, so the
                  reading-level/picked-up cards further down aren't buried under a long list. */}
              <div className="lg:hidden">
                <EarlierStoriesSummaryCard stories={earlier} index={1} />
              </div>

              {/* Desktop: full masonry grid inline in the left column. */}
              <div className="hidden lg:block">
                <h2 className="mb-3 text-sm font-bold text-ink">Earlier stories</h2>
                <Measure bounds>
                  {({ measureRef, contentRect }) => (
                    <div ref={measureRef}>
                      <Masonry columnsCount={(contentRect.bounds?.width ?? 0) >= TWO_COLUMN_MIN_WIDTH ? 2 : 1} gutter="0.75rem">
                        {earlier.map((story, i) => (
                          <EarlierStoryCard key={story.id} story={story} index={i + 1} />
                        ))}
                      </Masonry>
                    </div>
                  )}
                </Measure>
              </div>
            </>
          )}
        </div>

        {/* Right rail (desktop) */}
        <div className="mt-5 flex flex-col gap-4 lg:mt-0">
          {pendingState === 'generating' && <TomorrowStoryCard index={0} />}
          {pendingState === 'waitingTomorrow' && <WaitingTomorrowCard index={0} />}
          <ReadingLevelCard level={readingLevel} index={1} />
          <PickedUpCard stories={stories} index={2} />
        </div>
      </div>
    </div>
  );
}
