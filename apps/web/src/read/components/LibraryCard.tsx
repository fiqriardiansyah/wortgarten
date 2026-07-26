import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import Measure from 'react-measure';
import { Swiper, SwiperSlide } from 'swiper/react';
import type { Swiper as SwiperInstance } from 'swiper';
import 'swiper/css';
import type { Story, WorldProgress } from '@wortgarten/shared';
import { Chip } from '@/components/ui/Chip';
import { SketchBox } from '@/components/ui/SketchBox';
import { tokens } from '@/design/tokens';
import { cardEnterVariants, cardEnterTransition } from '@/design/motion';
import { useWorlds } from '../api/useWorlds';
import { useMissingWorldWords } from '../api/useMissingWorldWords';
import { StoryRow } from './StoryRow';
import { WorldProgressBar, knownWordsLine, MissingWorldWords, LockedWorldTeaser } from './WorldsCard';

interface LibraryCardProps {
  stories: Story[];
  index: number;
}

interface Shelf {
  key: string;
  title: string;
  hint: string | null;
  icon: string | null;
  image: string | null;
  stories: Story[];
  // Null for the "Other stories" pseudo-shelf (null worldKey) — no world to show progress for.
  progress: WorldProgress | null;
}

const MAX_TABS = 5;

/** Builds the strip's tab list — every world, not just ones with stories already in them, so a
 * still-locked world is discoverable before its first story ever generates. Order: the single
 * nearest-to-unlock locked world first (if any world is still locked), then unlocked worlds, then
 * any remaining locked worlds. Among the unlocked worlds: whichever one holds today's freshly
 * generated story (if any) leads — that's the one thing here the user hasn't seen yet — and the
 * rest fall in behind it ordered by their own last-generated story, most recent first. A null
 * worldKey (stories generated before Story Worlds shipped) still gets its own trailing "Other
 * stories" tab, appended after the real worlds. Capped at `MAX_TABS` total — anything beyond that
 * only reachable via "See all worlds". */
function buildTabs(stories: Story[], worlds: WorldProgress[]): Shelf[] {
  const storiesByKey = new Map<string, Story[]>();
  for (const story of stories) {
    const key = story.worldKey ?? '__none__';
    if (!storiesByKey.has(key)) storiesByKey.set(key, []);
    storiesByKey.get(key)!.push(story);
  }

  const newStoryWorldKey = stories.find((s) => s.isNewToday)?.worldKey ?? null;
  const lastStoryTime = (key: string) =>
    Math.max(0, ...(storiesByKey.get(key) ?? []).map((s) => new Date(s.createdAt).getTime()));

  const locked = worlds
    .filter((w) => !w.isUnlocked)
    .sort((a, b) => a.requiredCount - a.haveCount - (b.requiredCount - b.haveCount));
  const nearestLocked = locked[0];
  const unlocked = worlds
    .filter((w) => w.isUnlocked)
    .sort((a, b) => {
      if (a.key === newStoryWorldKey) return -1;
      if (b.key === newStoryWorldKey) return 1;
      return lastStoryTime(b.key) - lastStoryTime(a.key);
    });
  const restLocked = locked.slice(1);

  const orderedWorlds = [...(nearestLocked ? [nearestLocked] : []), ...unlocked, ...restLocked];
  const worldTabs: Shelf[] = orderedWorlds.map((world) => ({
    key: world.key,
    title: world.name,
    hint: world.hint,
    icon: world.icon,
    image: world.image,
    stories: storiesByKey.get(world.key) ?? [],
    progress: world,
  }));

  const otherStories = storiesByKey.get('__none__');
  const tabs = otherStories
    ? [...worldTabs, { key: '__none__', title: 'Other stories', hint: null, icon: null, image: null, stories: otherStories, progress: null }]
    : worldTabs;

  return tabs.slice(0, MAX_TABS);
}

function WorldTab({ shelf, active, onSelect }: { shelf: Shelf; active: boolean; onSelect: () => void }) {
  const locked = shelf.progress ? !shelf.progress.isUnlocked : false;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="relative block h-28 w-40 flex-shrink-0 overflow-hidden rounded-2xl transition-transform"
      style={{ transform: active ? 'scale(1)' : 'scale(0.96)' }}
    >
      {shelf.image ? (
        <img
          src={shelf.image}
          alt=""
          loading="lazy"
          className={`absolute inset-0 h-full w-full object-cover ${locked ? 'grayscale' : ''}`}
        />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: active ? tokens.color.teal : tokens.color.muted }} />
      )}

      {/* Scrim so title/hint stay readable over any photo — teal-tinted when this is the active
          tab (no border/ring available to mark selection, see caller), plain dark otherwise. */}
      <div
        className="absolute inset-0"
        style={{
          background: active
            ? `linear-gradient(to top, ${tokens.color.tealDeep}CC, ${tokens.color.tealDeep}4D)`
            : `linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0.25))`,
        }}
      />

      <Chip variant={active ? 'mastered' : 'neutral'} className="absolute right-2 top-2">
        {shelf.stories.length} Stories
      </Chip>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 px-3 pb-2.5 pt-6 text-left">
        <div>
          <span className="block text-sm font-bold leading-tight text-white">{shelf.title}</span>
          {shelf.hint && <span className="block text-xs leading-tight text-white/85">{shelf.hint}</span>}
        </div>
        {shelf.progress && !shelf.progress.isUnlocked && (
          <WorldProgressBar
            haveCount={shelf.progress.haveCount}
            addedCount={shelf.progress.addedCount}
            requiredCount={shelf.progress.requiredCount}
          />
        )}
      </div>
    </button>
  );
}

function TabNavButton({ direction, onClick }: { direction: 'prev' | 'next'; onClick: () => void }) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 'prev' ? 'Previous world' : 'Next world'}
      className="flex border z-10 border-black h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-line-soft"
      style={{ backgroundColor: tokens.color.surface }}
    >
      <Icon size={18} />
    </button>
  );
}

/** The archive half of the Read page — read/earlier stories are grouped into per-world shelves
 * (a "your worlds" tab strip, swipeable/scrollable once worlds outgrow the visible width) with
 * only the selected world's stories shown below as compact rows. This is what keeps the page
 * short and readable at 50+ stories across many worlds: one tab, one story list, never every
 * shelf stacked open at once. */
export function LibraryCard({ stories, index }: LibraryCardProps) {
  const { data } = useWorlds();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // Which of the panel's two tabs is showing — always resets to "stories" on world switch (see
  // selectTab), the world tile strip above already carries the unlock/progress framing so landing
  // on the story list is what makes the page look alive, not a bare word-adding checklist.
  const [panelTab, setPanelTab] = useState<'stories' | 'words'>('stories');
  const swiperRef = useRef<SwiperInstance | null>(null);
  const sectionRef = useRef<HTMLDivElement | null>(null);

  const tabs = buildTabs(stories, data?.worlds ?? []);
  // Default landing tab: whichever world holds today's freshly generated story (the one thing the
  // user hasn't seen yet) — falling back to the first tab that actually has something to read,
  // which thanks to buildTabs' recency sort is the most-recently-active world. The nearest-locked
  // world leads the strip visually, but landing on its (usually empty) story list would make the
  // page look broken on first load.
  const active =
    tabs.find((tab) => tab.key === activeKey) ??
    tabs.find((tab) => tab.stories.some((s) => s.isNewToday)) ??
    tabs.find((tab) => tab.stories.length > 0) ??
    tabs[0];
  // Fetched unconditionally (hooks can't follow the early return below) — `active` may be
  // undefined for one render while world data is still loading, same as `active?.key` elsewhere.
  const missingWords = useMissingWorldWords(active?.key ?? null);

  if (stories.length === 0) return null;

  // Tapping a world tile swaps the story list below the strip — scroll this whole section back to
  // the top of the viewport so that swapped list is what the user lands on, not left scrolled past.
  function selectTab(key: string) {
    setActiveKey(key);
    setPanelTab('stories');
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <motion.div
      ref={sectionRef}
      variants={cardEnterVariants}
      initial="hidden"
      animate="visible"
      transition={cardEnterTransition(index)}
    >
      <div className="flex items-center justify-end">
        <Link to="/worlds" className="text-xs font-semibold text-teal hover:underline">
          See all worlds →
        </Link>
      </div>

      <div className="relative mt-2">
        {/* Swiper's `slidesPerView="auto"` sizes itself off its slides' own widths, not the
            available space — a bare `flex-1` never reliably shrinks it back down, so the strip
            was blowing out the page's horizontal width. Measure the empty slot first (its width
            is trustworthy: nothing inside it yet to inflate it), then mount the Swiper with that
            exact pixel width once known, instead of trusting flexbox to size it. The nav buttons
            float on top at the edges (not siblings in flow) so the first/last tile lines up flush
            underneath them instead of the strip being squeezed inward to make room. */}
        <Measure bounds>
          {({ measureRef, contentRect }) => {
            const width = contentRect.bounds?.width ?? 0;
            return (
              <div ref={measureRef} className="overflow-hidden">
                {width > 0 && (
                  <Swiper
                    onSwiper={(swiper) => {
                      swiperRef.current = swiper;
                    }}
                    slidesPerView="auto"
                    spaceBetween={12}
                    style={{ width }}
                    className="!py-1"
                  >
                    {tabs.map((tab) => (
                      <SwiperSlide key={tab.key} style={{ width: 'auto' }}>
                        <WorldTab shelf={tab} active={tab.key === active.key} onSelect={() => selectTab(tab.key)} />
                      </SwiperSlide>
                    ))}
                  </Swiper>
                )}
              </div>
            );
          }}
        </Measure>
        {tabs.length > 1 && (
          <div className="absolute inset-y-0 -left-4 flex items-center">
            <TabNavButton direction="prev" onClick={() => swiperRef.current?.slidePrev()} />
          </div>
        )}
        {tabs.length > 1 && (
          <div className="absolute inset-y-0 -right-4 flex items-center">
            <TabNavButton direction="next" onClick={() => swiperRef.current?.slideNext()} />
          </div>
        )}
      </div>

      <SketchBox seed={`library-panel-${active.key}`} className="mt-3">
        <div className="flex max-h-[40vh] flex-col">
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-line-soft px-3 pb-2 pt-3">
            {active.icon && <span className="text-lg leading-none">{active.icon}</span>}
            <p className="text-sm font-bold text-ink">{active.title}</p>
            {active.progress && !active.progress.isUnlocked && <Lock size={14} className="text-muted" />}
          </div>

          {active.progress && !active.progress.isUnlocked && (
            <div className="flex-shrink-0 border-b border-line-soft px-3 pb-3 pt-3">
              <p className="text-xs text-muted">Stories set {active.progress.hint}.</p>
              {knownWordsLine(active.progress) && <p className="mt-2 text-xs text-ink">{knownWordsLine(active.progress)}</p>}
              <div className="mt-2.5">
                <WorldProgressBar
                  haveCount={active.progress.haveCount}
                  addedCount={active.progress.addedCount}
                  requiredCount={active.progress.requiredCount}
                />
              </div>
            </div>
          )}

          <div className="flex flex-shrink-0 gap-4 border-b border-line-soft px-3">
            <PanelTabButton label="Stories" active={panelTab === 'stories'} onClick={() => setPanelTab('stories')} />
            <PanelTabButton
              label="Word to add"
              count={missingWords.data?.words.length ?? 0}
              active={panelTab === 'words'}
              onClick={() => setPanelTab('words')}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            {panelTab === 'stories' ? (
              active.progress && !active.progress.isUnlocked ? (
                <LockedWorldTeaser world={active.progress} onAddWords={() => setPanelTab('words')} />
              ) : active.stories.length > 0 ? (
                active.stories.map((story) => <StoryRow key={story.id} story={story} />)
              ) : (
                <p className="py-2 text-sm text-muted">No stories set here yet.</p>
              )
            ) : missingWords.isLoading ? (
              <p className="py-2 text-sm text-muted">Loading…</p>
            ) : (missingWords.data?.words.length ?? 0) > 0 ? (
              <MissingWorldWords worldKey={active.key} className="flex flex-col" />
            ) : (
              <p className="py-2 text-sm text-muted">No words to add here yet.</p>
            )}
          </div>
        </div>
      </SketchBox>
    </motion.div>
  );
}

/** The panel's two-tab switcher — "Stories" and "Word to add", the latter carrying a live count
 * badge (styled like StoryRow's "+N new words" chip) so the tab itself previews whether there's
 * anything to add before it's even open. */
export function PanelTabButton({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 border-b-2 py-2 text-sm font-semibold transition-colors"
      style={{ borderColor: active ? tokens.color.teal : 'transparent', color: active ? tokens.color.ink : tokens.color.muted }}
    >
      {label}
      {!!count && (
        <Chip variant="lilac" className="flex-shrink-0">
          +{count} new word{count === 1 ? '' : 's'}
        </Chip>
      )}
    </button>
  );
}
