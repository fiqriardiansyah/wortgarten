import { BookOpen, Sparkles } from 'lucide-react';
import { ZodError } from 'zod';
import { tokens } from '@/design/tokens';
import { useGenerateStoryDev, useLibrary } from '@/read/api/useLibrary';
import { StackedHeroCard } from '@/read/components/StackedHeroCard';
import { LibraryCard } from '@/read/components/LibraryCard';
import { TomorrowStoryCard } from '@/read/components/TomorrowStoryCard';
import { WaitingTomorrowCard } from '@/read/components/WaitingTomorrowCard';
import { ReadingLevelCard } from '@/read/components/ReadingLevelCard';
import { PickedUpCard } from '@/read/components/PickedUpCard';
import { WorldsCard } from '@/read/components/WorldsCard';

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

  // Only today's genuinely unread story earns the hero slot — never fall back to re-showing an
  // already-read story there. When there is none, pendingState (always set in that case, see
  // StoriesService.listForUser) drives the hero slot instead (Tomorrow's-story states below).
  const hero = stories.find((story) => story.isNewToday) ?? null;
  // Includes the hero itself — a story only READY today still belongs to its world's shelf, or
  // that world would look empty until tomorrow just because its one story hasn't been read yet.
  const earlier = stories.filter((story) => story.status === 'READY');
  const readCount = stories.filter((story) => story.isRead).length;
  const unreadCount = stories.filter((story) => !story.isRead).length;

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
        {/* Main column — today's story is the single reward at the top, alone; worlds and the
            shelved library are structural content, not sidebar furniture, so they live here too. */}
        <div className="flex flex-col gap-5">
          {hero ? (
            <StackedHeroCard story={hero} hasMoreUnread={unreadCount > 1} />
          ) : pendingState === 'generating' ? (
            <TomorrowStoryCard index={0} />
          ) : pendingState === 'waitingTomorrow' ? (
            <WaitingTomorrowCard index={0} />
          ) : null}

          <WorldsCard index={1} />

          <LibraryCard stories={earlier} index={2} />
        </div>

        {/* Right rail (desktop) — reading level and picked-up-while-reading only. Sticky + self-start
            so it pins in the viewport while the (usually longer) main column scrolls past it. */}
        <div className="mt-5 flex flex-col gap-4 lg:sticky lg:top-5 lg:mt-0 lg:self-start">
          <ReadingLevelCard level={readingLevel} index={0} />
          <PickedUpCard stories={stories} index={1} />
        </div>
      </div>
    </div>
  );
}
