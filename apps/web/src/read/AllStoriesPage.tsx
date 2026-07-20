import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Measure from 'react-measure';
import Masonry from 'react-responsive-masonry';
import { Button } from '@/components/ui/Button';
import { useLibrary } from '@/read/api/useLibrary';
import { EarlierStoryCard } from '@/read/components/EarlierStoryCard';

const PAGE_SIZE = 12;
const TWO_COLUMN_MIN_WIDTH = 480;

/** Full paginated list behind the mobile "Earlier stories" summary card (see
 * EarlierStoriesSummaryCard) — pagination is client-side since useLibrary already fetches every
 * story in one call and ReadPage's masonry list already rendered them all at once. */
export function AllStoriesPage() {
  const { data, isLoading, isError } = useLibrary();
  const [page, setPage] = useState(1);

  if (isLoading) return <p className="py-12 text-center text-muted">Loading…</p>;
  if (isError || !data) return <p className="py-12 text-center text-muted">Failed to load your library.</p>;

  const hero = data.stories.find((story) => story.isNewToday) ?? data.stories.find((story) => story.status === 'READY');
  const earlier = data.stories.filter((story) => story.status === 'READY' && story.id !== hero?.id);
  const totalPages = Math.max(1, Math.ceil(earlier.length / PAGE_SIZE));
  const pageItems = earlier.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <Link to="/read" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft size={16} /> Back to Read
      </Link>
      <h1 className="text-[28px] font-extrabold leading-tight text-ink">Earlier stories</h1>
      <p className="mt-0.5 text-sm text-muted">
        {earlier.length} {earlier.length === 1 ? 'story' : 'stories'}
      </p>

      {earlier.length === 0 && <p className="mt-8 text-center text-muted">No earlier stories yet.</p>}

      {pageItems.length > 0 && (
        <div className="mt-5">
          <Measure bounds>
            {({ measureRef, contentRect }) => (
              <div ref={measureRef}>
                <Masonry columnsCount={(contentRect.bounds?.width ?? 0) >= TWO_COLUMN_MIN_WIDTH ? 2 : 1} gutter="0.75rem">
                  {pageItems.map((story, i) => (
                    <EarlierStoryCard key={story.id} story={story} index={i} />
                  ))}
                </Masonry>
              </div>
            )}
          </Measure>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            Previous
          </Button>
          <span className="text-sm text-muted">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
