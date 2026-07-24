import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import type { Story } from '@wortgarten/shared';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { useWorlds } from '../api/useWorlds';

interface LibraryCardProps {
  stories: Story[];
  index: number;
}

interface Shelf {
  key: string;
  title: string;
  icon: string | null;
  stories: Story[];
}

// Shelves stay expanded up to this many before the rest collapse behind a tap — keeps the library
// short and scannable even once it holds 50+ stories (fix 3d/3e).
const AUTO_EXPANDED_SHELVES = 2;

/** Groups an already-desc-by-createdAt story list into per-world shelves, ordered by each shelf's
 * most recent story. A null worldKey (stories generated before Story Worlds shipped) groups under
 * its own "Other stories" shelf rather than crashing or merging into a real world's shelf. */
function groupByWorld(stories: Story[], worldsByKey: Map<string, { name: string; icon: string }>): Shelf[] {
  const order: string[] = [];
  const byKey = new Map<string, Story[]>();
  for (const story of stories) {
    const key = story.worldKey ?? '__none__';
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)!.push(story);
  }

  return order
    .map((key) => {
      const world = key === '__none__' ? null : worldsByKey.get(key);
      return {
        key,
        title: world?.name ?? 'Other stories',
        icon: world?.icon ?? null,
        stories: byKey.get(key)!,
      };
    })
    .sort((a, b) => b.stories[0].createdAt.localeCompare(a.stories[0].createdAt));
}

function StoryRow({ story }: { story: Story }) {
  const navigate = useNavigate();
  const newCount = story.newWords.length;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/read/${story.id}`)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        navigate(`/read/${story.id}`);
      }}
      className="flex w-full items-center gap-3 border-b border-line-soft py-2.5 text-left last:border-b-0"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{story.title}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <span>{story.estMinutes} min</span>
          {story.isRead ? (
            <span className="flex items-center gap-0.5 text-teal">
              <Check size={11} /> read
            </span>
          ) : newCount > 0 ? (
            <span>
              +{newCount} new word{newCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </p>
      </div>
      <ChevronRight size={16} className="flex-shrink-0 text-muted" />
    </div>
  );
}

function ShelfSection({ shelf, defaultExpanded }: { shelf: Shelf; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border-t border-line pt-3 first:border-t-0 first:pt-0">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
          {shelf.icon && <span>{shelf.icon}</span>} {shelf.title}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted">
          <Chip variant="neutral">{shelf.stories.length}</Chip>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {expanded && (
        <div className="mt-1">
          {shelf.stories.map((story) => (
            <StoryRow key={story.id} story={story} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The archive half of the Read page — read/earlier stories render as compact rows grouped into
 * per-world shelves, never as image cards (that visual weight is reserved for today's hero). This
 * is what keeps the page short and readable at 50+ stories: a shelf is one line until opened. */
export function LibraryCard({ stories, index }: LibraryCardProps) {
  const { data } = useWorlds();
  if (stories.length === 0) return null;

  const worldsByKey = new Map((data?.worlds ?? []).map((w) => [w.key, { name: w.name, icon: w.icon }]));
  const shelves = groupByWorld(stories, worldsByKey);

  return (
    <Card index={index}>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-bold text-ink">Your library</p>
        <p className="text-xs text-muted">
          {stories.length} {stories.length === 1 ? 'story' : 'stories'}
        </p>
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {shelves.map((shelf, i) => (
          <ShelfSection key={shelf.key} shelf={shelf} defaultExpanded={i < AUTO_EXPANDED_SHELVES} />
        ))}
      </div>
    </Card>
  );
}
