import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import type { WorldProgress } from '@wortgarten/shared';
import { Card } from '@/components/ui/Card';
import { tokens } from '@/design/tokens';
import { worldSwitchVariants } from '@/design/motion';
import { useWorlds } from './api/useWorlds';
import { useWorldStories } from './api/useWorldStories';
import { useMissingWorldWords } from './api/useMissingWorldWords';
import { WorldProgressBar, knownWordsLine, MissingWorldWords } from './components/WorldsCard';
import { StoryRow } from './components/StoryRow';
import { PanelTabButton } from './components/LibraryCard';

// Rail tiles are a fixed base size — the page itself scrolls (the rail no longer owns its own
// scroll container), so nothing here does scroll-position math beyond the distance-from-active
// falloff below.
// Height is never animated — a tile growing taller reflows every tile below it, which moves
// scrollY, which re-fires the scroll-spy, which can grow/shrink the tile again: an infinite
// resize-scroll loop. Width-only growth changes nothing in the vertical flow, so it's safe.
const ITEM_HEIGHT = 76;
// Resting tile width: a thin sliver on mobile (labels are illegible at that width anyway, so it's
// not trying to be one), the old regular size from tablet up.
const MOBILE_ITEM_WIDTH = 20;
const REGULAR_ITEM_WIDTH = 100;
const WIDE_SCREEN_QUERY = '(min-width: 768px)';
// Coverflow-style falloff: the active tile (distance 0) grows past the rail column's own width
// and overlaps the detail Card — that's intentional (z-index below keeps it on top). Tiles taper
// back to the resting width by distance 3.
const RAIL_WIDTHS = [160, 130, 112];
function railWidthForDistance(distance: number, baseWidth: number) {
  return RAIL_WIDTHS[distance] ?? baseWidth;
}

function useIsWideScreen() {
  const [isWide, setIsWide] = useState(() => window.matchMedia(WIDE_SCREEN_QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia(WIDE_SCREEN_QUERY);
    const onChange = () => setIsWide(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isWide;
}
const PANEL_HEIGHT = 'min(72vh, 640px)';
const PANEL_HALF_HEIGHT = 'min(36vh, 320px)';

function RailSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="animate-pulse rounded-sketch bg-card/60" style={{ height: ITEM_HEIGHT }} />
      ))}
    </div>
  );
}

// Mirrors LibraryCard's `WorldTab` tile — a photo/color-filled card with a bottom scrim and
// overlaid title/status — so a world reads the same whether it's met on the Read page's swiper
// strip or here in the full list. Locked worlds get a grayscale image, same as WorldTab.
function WorldRailItem({
  world,
  active,
  distance,
  baseWidth,
  onSelect,
  registerRef,
}: {
  world: WorldProgress;
  /** Whether this is the selected world — drives the teal color, independent of scroll state. */
  active: boolean;
  /** Absolute index distance from the currently active rail item, or Infinity while at rest — the
   * coverflow-style size falloff (via `railSizeForDistance`) only shows up mid-scroll. */
  distance: number;
  /** Resting width — mobile sliver vs. the regular tablet-and-up size. */
  baseWidth: number;
  onSelect: () => void;
  registerRef: (el: HTMLButtonElement | null) => void;
}) {
  const locked = !world.isUnlocked;
  const width = railWidthForDistance(distance, baseWidth);
  return (
    <motion.button
      ref={registerRef}
      type="button"
      data-world-key={world.key}
      onClick={onSelect}
      className="relative block flex-shrink-0 overflow-hidden rounded-2xl text-left"
      style={{ zIndex: 1, height: ITEM_HEIGHT, overflowAnchor: 'none' }}
      animate={{ width }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
    >
      {world.image ? (
        <img
          src={world.image}
          alt=""
          loading="lazy"
          className={`absolute inset-0 h-full w-full object-cover ${locked ? 'grayscale' : ''}`}
        />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: active ? tokens.color.teal : tokens.color.muted }} />
      )}

      <div
        className="absolute inset-0"
        style={{
          background: active
            ? `linear-gradient(to top, ${tokens.color.tealDeep}CC, ${tokens.color.tealDeep}4D)`
            : `linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0.25))`,
        }}
      />

      <span className="absolute left-2.5 top-2 text-lg leading-none">{world.icon}</span>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 px-2.5 pb-1.5 pt-4 text-left">
        <span className="truncate text-sm font-bold leading-tight text-white">{world.name}</span>
        {!world.isUnlocked && (
          <span className="text-[11px] font-semibold text-white/85">
            {world.haveCount}/{world.requiredCount}
          </span>
        )}
      </div>
    </motion.button>
  );
}

function WorldStories({ worldKey }: { worldKey: string }) {
  const { data, isLoading } = useWorldStories(worldKey);

  if (isLoading) return <p className="text-xs text-muted">Loading…</p>;
  if (!data || data.stories.length === 0) return <p className="text-xs text-muted">No stories set here yet.</p>;

  return (
    <div className="flex flex-col">
      {data.stories.map((story) => (
        <StoryRow key={story.id} story={story} />
      ))}
    </div>
  );
}

// Bottom half mirrors LibraryCard's tabbed panel exactly (same "Stories" / "Word to add" tabs,
// same count badge) — a world reached from the Read page strip or from this full list should
// feel like the same UI, not two competing designs.
function WorldDetailPanel({ world }: { world: WorldProgress }) {
  const [panelTab, setPanelTab] = useState<'stories' | 'words'>('stories');
  const missingWords = useMissingWorldWords(world.key);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-shrink-0 items-start gap-3">
        <span className="text-2xl leading-none">{world.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-extrabold leading-tight text-ink">{world.name}</p>
          <p className="mt-0.5 text-xs text-muted">Stories set {world.hint}.</p>
        </div>
        <span className="flex-shrink-0 text-xs font-semibold" style={{ color: world.isUnlocked ? tokens.color.teal : tokens.color.muted }}>
          {world.isUnlocked ? 'Unlocked' : `${world.haveCount}/${world.requiredCount}`}
        </span>
      </div>

      <div className="mt-3 flex-shrink-0">
        <WorldProgressBar haveCount={world.haveCount} addedCount={world.addedCount} requiredCount={world.requiredCount} />
      </div>
      {knownWordsLine(world) && <p className="mt-2.5 flex-shrink-0 text-xs text-ink">{knownWordsLine(world)}</p>}

      <div className="mt-4 flex flex-shrink-0 gap-4 border-b border-t border-line-soft pt-3">
        <PanelTabButton label="Stories" active={panelTab === 'stories'} onClick={() => setPanelTab('stories')} />
        <PanelTabButton
          label="Word to add"
          count={missingWords.data?.words.length ?? 0}
          active={panelTab === 'words'}
          onClick={() => setPanelTab('words')}
        />
      </div>

      <div className="min-h-0 flex-1 pt-2">
        {panelTab === 'stories' ? (
          <WorldStories worldKey={world.key} />
        ) : missingWords.isLoading ? (
          <p className="py-2 text-sm text-muted">Loading…</p>
        ) : (missingWords.data?.words.length ?? 0) > 0 ? (
          <MissingWorldWords worldKey={world.key} className="flex flex-col" />
        ) : (
          <p className="py-2 text-sm text-muted">No words to add here yet.</p>
        )}
      </div>
    </div>
  );
}

// Nearest-locked-first, same ordering LibraryCard's world tab strip uses — the world the user is
// closest to unlocking leads the list, not buried among worlds they haven't touched yet.
function orderWorlds(worlds: WorldProgress[]): WorldProgress[] {
  const locked = worlds
    .filter((w) => !w.isUnlocked)
    .sort((a, b) => a.requiredCount - a.haveCount - (b.requiredCount - b.haveCount));
  const unlocked = worlds.filter((w) => w.isUnlocked);
  const [nearestLocked, ...restLocked] = locked;
  return [...(nearestLocked ? [nearestLocked] : []), ...unlocked, ...restLocked];
}

export function WorldsListPage() {
  const { data, isLoading } = useWorlds();
  const worlds = orderWorlds(data?.worlds ?? []);
  const railBaseWidth = useIsWideScreen() ? REGULAR_ITEM_WIDTH : MOBILE_ITEM_WIDTH;

  const [activeKey, setActiveKey] = useState<string | null>(null);
  // The coverflow size falloff (railSizeForDistance) only shows while the rail is actually being
  // scrolled — true while scroll events are arriving, flips back after ~150ms of quiet.
  const [isScrolling, setIsScrolling] = useState(false);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  // A programmatic scroll (click-to-select) fires the same scroll events a manual drag would —
  // this flag mutes the scroll-spy while that animation is in flight so it doesn't fight the
  // click (the click already set activeKey directly).
  const suppressSpyRef = useRef(false);
  const scrollIdleTimeoutRef = useRef<number | undefined>(undefined);

  // Land on whatever world the API listed first once loaded.
  useEffect(() => {
    if (worlds.length === 0) return;
    if (activeKey && worlds.some((w) => w.key === activeKey)) return;
    setActiveKey(worlds[0].key);
  }, [worlds, activeKey]);

  // Scroll-spy: whichever rail tile's centre is closest to the viewport's vertical middle becomes
  // the active world. Computed directly off each tile's live bounding rect (not an
  // IntersectionObserver line-crossing check) — a thin "0-height line" trick misses tiles outright
  // on a single large discrete scroll jump (e.g. a fast mouse-wheel tick moving past more than one
  // tile's stride in one step, with no intermediate frame for the line to have crossed them in).
  // Comparing distances directly can't skip a tile no matter how big the jump was, and it also
  // naturally handles both scroll edges — the first tile is trivially closest at scrollY 0, and the
  // last is closest at max scroll thanks to the rail's own bottom padding.
  useEffect(() => {
    if (worlds.length === 0) return;

    let raf = 0;
    function updateActiveFromScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const centerY = window.innerHeight / 2;
        let closestKey: string | null = null;
        let closestDistance = Infinity;
        for (const world of worlds) {
          const el = itemRefs.current.get(world.key);
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          const distance = Math.abs(rect.top + rect.height / 2 - centerY);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestKey = world.key;
          }
        }
        if (closestKey) setActiveKey(closestKey);
      });
    }

    function onScroll() {
      if (suppressSpyRef.current) return;
      setIsScrolling(true);
      window.clearTimeout(scrollIdleTimeoutRef.current);
      scrollIdleTimeoutRef.current = window.setTimeout(() => setIsScrolling(false), 150);
      updateActiveFromScroll();
    }

    updateActiveFromScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
      window.clearTimeout(scrollIdleTimeoutRef.current);
    };
  }, [worlds]);

  function selectWorld(key: string) {
    setActiveKey(key);

    const el = itemRefs.current.get(key);
    if (!el) return;
    suppressSpyRef.current = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      suppressSpyRef.current = false;
    }, 700);
  }

  const activeWorld = worlds.find((w) => w.key === activeKey) ?? null;
  const activeIndex = Math.max(
    worlds.findIndex((w) => w.key === activeKey),
    0,
  );

  return (
    <div className="lg:mx-auto lg:max-w-2xl">
      <Link to="/read" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft size={16} /> Back to Read
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight text-ink">Your worlds</h1>
          <p className="mt-0.5 text-sm text-muted">Every world your stories can be set in</p>
        </div>
        {/* requiredCount:0 (the always-free "everyday" world) is excluded from both counts — it was
            never actually locked, so it isn't a real "unlocked" achievement (see recordUnlocks). */}
        {worlds.length > 0 && (
          <span
            className="flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-bold"
            style={{ backgroundColor: `${tokens.color.teal}1A`, color: tokens.color.teal }}
          >
            {worlds.filter((w) => w.requiredCount > 0 && w.isUnlocked).length}/{worlds.filter((w) => w.requiredCount > 0).length} unlocked
          </span>
        )}
      </div>

      {isLoading && (
        <div className="mt-5 flex gap-5">
          <div className="flex-shrink-0" style={{ width: railBaseWidth }}>
            <RailSkeleton />
          </div>
          <div className="min-w-0 flex-1 animate-pulse rounded-sketch bg-card/60" style={{ height: PANEL_HEIGHT }} />
        </div>
      )}

      {!isLoading && worlds.length > 0 && (
        <div className="mt-5 flex gap-5">
          {/* Top and bottom padding push the rail's own content so the first and last tile can
              each reach the viewport's middle — the detail panel isn't touched, it just keeps
              sitting flush with the row's top and pulls into its own sticky-centred position once
              scrolling reaches it. The column itself is pinned to the tiles' resting width (not the
              old fixed w-36/w-44 box) so there's no dead space before the 20px gap to the Card —
              growing tiles then overflow past this narrow box on purpose, overlapping the Card. */}
          <div className="flex flex-shrink-0 flex-col gap-3 pb-[50vh] pt-[30vh]" style={{ width: railBaseWidth, overflowAnchor: 'none' }}>
            {worlds.map((world, index) => (
              <WorldRailItem
                key={world.key}
                world={world}
                active={world.key === activeKey}
                distance={isScrolling ? Math.abs(index - activeIndex) : Infinity}
                baseWidth={railBaseWidth}
                onSelect={() => selectWorld(world.key)}
                registerRef={(el) => {
                  if (el) itemRefs.current.set(world.key, el);
                  else itemRefs.current.delete(world.key);
                }}
              />
            ))}
          </div>

          <div className="min-w-0 flex-1">
            {/* Sticky offset is pinned at viewport-middle minus half the panel's own height, not a
                flex-centered h-dvh box — that way the panel's natural (pre-stick) position is flush
                with the rail's first tile, and it only pulls in to center once scrolling would
                otherwise carry it there anyway, instead of starting pre-shifted downward. */}
            <Card
              index={0}
              className="h-full w-full overflow-hidden"
              style={{ height: PANEL_HEIGHT, position: 'sticky', top: `calc(50vh - ${PANEL_HALF_HEIGHT})` }}
            >
              {/* No mode="wait" here on purpose — under fast repeated scrolling, activeKey can
                  change faster than an exit animation finishes, and "wait" mode's exit/enter
                  queue can get stuck on an interrupted exit (a known framer-motion gotcha),
                  freezing the panel on a stale world. Overlapping enter/exit always tracks the
                  latest activeKey since each key is independently mounted/unmounted. */}
              <AnimatePresence>
                {activeWorld && (
                  <motion.div
                    key={activeWorld.key}
                    className="h-full"
                    variants={worldSwitchVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    <WorldDetailPanel world={activeWorld} />
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
