import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { MissingWorldWord, WorldProgress } from '@wortgarten/shared';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { tokens } from '@/design/tokens';
import { useAddWord } from '@/features/add-words/api/useAddWord';
import { useCreateSession } from '@/features/session/api/useCreateSession';
import { useWorlds } from '../api/useWorlds';
import { useMissingWorldWords } from '../api/useMissingWorldWords';
import { useSenseDetail } from '../api/useSenseDetail';
import { WordDetailModal } from './WordDetailModal';

interface WorldsCardProps {
  index: number;
}

/** Two-tone bar: solid teal = haveCount (RECOGNIZE+, counts toward the unlock), soft teal = words
 * already added but still NEW (not yet counting) — makes `+ Add` visibly do something immediately
 * instead of a word silently vanishing into nothing. Exported: the world detail page and
 * LibraryCard's world tiles both reuse this exact bar. */
export function WorldProgressBar({ haveCount, addedCount, requiredCount }: { haveCount: number; addedCount: number; requiredCount: number }) {
  const havePct = requiredCount === 0 ? 100 : Math.min((haveCount / requiredCount) * 100, 100);
  const addedPct = requiredCount === 0 ? 0 : Math.min((addedCount / requiredCount) * 100, 100 - havePct);

  return (
    <div
      className="w-full overflow-hidden rounded-pill"
      style={{ height: tokens.component.progressBar.height, backgroundColor: tokens.color.line }}
    >
      <div className="flex h-full">
        <div className="h-full" style={{ width: `${havePct}%`, backgroundColor: tokens.color.yellow }} />
        <div className="h-full" style={{ width: `${addedPct}%`, backgroundColor: tokens.color.yellowSoft }} />
      </div>
    </div>
  );
}

/** Mirror-voice known-words line ("You know: der Kaffee, +2 more") — exported for the world
 * detail page, which shows the same line under its own progress bar. */
export function knownWordsLine(world: WorldProgress): string | null {
  if (world.haveCount === 0) return null;
  const names = world.knownWords.map((w) => w.displayLemma).join(', ');
  const extra = world.haveCount - world.knownWords.length;
  return extra > 0 ? `You know: ${names}, +${extra} more` : `You know: ${names}`;
}

/** Progress-tier badge for the nearest locked world — exported so LibraryCard's locked-world
 * tile can show the same tiers. Never coral (locked = dim/inviting, not a warning). */
export function unlockBadge(world: WorldProgress): string {
  const remaining = world.requiredCount - world.haveCount;
  if (remaining <= 1) return "You're close to unlocking this world";
  if (remaining <= 3) return 'Few words left to unlock';
  return 'Next world to explore';
}

/** A beginner must never face a wall of locked doors — only the single nearest locked world ever
 * shows, with progress, never a list of every world still out of reach. Locked-world copy is
 * mirror-voice throughout ("you know", never "collect"/"required") and never coral — a locked
 * world is dim and inviting, not a warning. */
export function WorldsCard({ index }: WorldsCardProps) {
  const { data } = useWorlds();
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const createSession = useCreateSession();

  if (!data || data.worlds.length === 0) return null;

  const unlocked = data.worlds.filter((w) => w.isUnlocked);
  const nearestLocked = data.worlds
    .filter((w) => !w.isUnlocked)
    .sort((a, b) => a.requiredCount - a.haveCount - (b.requiredCount - b.haveCount))[0];

  async function handleStartSession() {
    const result = await createSession.mutateAsync();
    if (result.kind === 'session') navigate('/session', { state: { session: result.session } });
  }

  return (
    <Card index={index}>
      <p className="text-sm font-bold text-ink">Your worlds</p>
      <p className="mt-0.5 text-xs text-muted">Where your stories happen</p>

      {unlocked.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {unlocked.map((world) => (
            <Chip key={world.key} variant="lilac">
              {world.icon} {world.name}
            </Chip>
          ))}
        </div>
      )}

      {nearestLocked && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="flex items-start gap-2.5">
            <span className="text-xl leading-none text-muted">{nearestLocked.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{nearestLocked.name}</p>
              <p className="text-xs text-muted">Stories set {nearestLocked.hint}.</p>
            </div>
          </div>

          <div className="mt-2">
            <Chip variant="accent" radiusVariant="B">
              {unlockBadge(nearestLocked)}
            </Chip>
          </div>

          {knownWordsLine(nearestLocked) && <p className="mt-2 text-xs text-ink">{knownWordsLine(nearestLocked)}</p>}

          <div className="mt-3">
            <WorldProgressBar
              haveCount={nearestLocked.haveCount}
              addedCount={nearestLocked.addedCount}
              requiredCount={nearestLocked.requiredCount}
            />
          </div>

          {nearestLocked.addedCount > 0 && (
            <button
              type="button"
              onClick={handleStartSession}
              disabled={createSession.isPending}
              className="mt-2 text-xs font-semibold text-teal hover:underline"
            >
              {nearestLocked.addedCount} word{nearestLocked.addedCount === 1 ? '' : 's'} waiting in your next session →
            </button>
          )}

          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="mt-3 flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink"
          >
            {expanded ? 'Hide the words' : 'Peek at the words'}
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {expanded && <MissingWorldWords worldKey={nearestLocked.key} />}
        </div>
      )}
    </Card>
  );
}

function WordRow({ word, onOpen, onAdd }: { word: MissingWorldWord; onOpen: () => void; onAdd: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen();
      }}
      className="group flex w-full items-center gap-3 rounded-lg border-b border-line-soft px-2 py-2.5 text-left transition-colors last:border-b-0 hover:bg-line-soft"
    >
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{word.displayLemma}</span>
      <Chip variant="accent">NEW</Chip>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onAdd();
        }}
        aria-label={`Add ${word.displayLemma}`}
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full opacity-0 transition-all hover:scale-110 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Plus size={14} className="text-ink" />
      </button>
    </div>
  );
}

/** Stories-tab empty state for a locked world (WorldsListPage's detail panel and LibraryCard's
 * tabbed panel both use it) — a locked world has zero stories by definition (see
 * generate-story.ts), so "No stories set here yet." read as broken rather than "not yet". This
 * sells what's coming instead: the missing-word count doubles as the CTA count, and the "taste"
 * quote is a real Tatoeba example sentence for the first missing word (same `sense.example` field
 * WordDetailModal already shows) — never a fabricated line, since the words tab right next to it
 * would immediately contradict a fake preview. */
export function LockedWorldTeaser({ world, onAddWords }: { world: WorldProgress; onAddWords: () => void }) {
  const missingWords = useMissingWorldWords(world.key);
  const words = missingWords.data?.words ?? [];
  const count = words.length;
  const tasteDetail = useSenseDetail(words[0]?.senseId ?? null);
  const taste = tasteDetail.data?.sense.example ?? null;

  if (missingWords.isLoading) return <p className="py-2 text-sm text-muted">Loading…</p>;
  if (count === 0) return <p className="py-2 text-sm text-muted">No stories set here yet.</p>;

  return (
    <div className="flex flex-col items-center px-2 py-4 text-center">
      <div className="mb-4 flex items-end justify-center gap-6 border-b-2 pb-2" style={{ borderColor: tokens.color.line, width: 140 }}>
        <BookOpen size={22} style={{ color: tokens.color.teal }} />
        <span className="h-4 w-4 flex-shrink-0 rounded-full" style={{ backgroundColor: tokens.color.yellow }} />
      </div>

      <p className="text-sm font-extrabold text-ink">This world is almost stocked</p>
      <p className="mt-1.5 max-w-xs text-xs text-muted">
        Add {count} more word{count === 1 ? '' : 's'} and {world.name} comes alive with its own stories.
        {taste && " Here's the kind of thing you'll read:"}
      </p>

      {taste && (
        <div
          className="mt-3 w-full rounded-xl border border-dashed px-3 py-2.5 text-left"
          style={{ borderColor: tokens.color.line, backgroundColor: tokens.color.surfaceAlt }}
        >
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted">A taste</p>
          <p className="mt-1 text-sm italic text-ink">&ldquo;{taste}&rdquo;</p>
        </div>
      )}

      <Button className="mt-4" onClick={onAddWords}>
        Add these {count} word{count === 1 ? '' : 's'} →
      </Button>
    </div>
  );
}

/** The word-list half of a locked world's detail, shown both in the home page's "Peek at the
 * words" expander (WorldsCard) and in the Read page's locked-world tab (LibraryCard). Tapping a
 * row opens WordDetailModal; tapping its "+" button adds the word directly without opening it. */
export function MissingWorldWords({
  worldKey,
  className = 'mt-3 flex max-h-[40vh] flex-col overflow-y-auto',
}: {
  worldKey: string;
  // Override the wrapping div's layout — callers that already provide their own scroll container
  // (e.g. LibraryCard's tabbed panel) pass a bare `flex flex-col` so the list doesn't scroll twice.
  className?: string;
}) {
  const { data, isLoading } = useMissingWorldWords(worldKey);
  const addWord = useAddWord();
  const queryClient = useQueryClient();
  const [openWord, setOpenWord] = useState<MissingWorldWord | null>(null);

  if (isLoading) return <p className="mt-3 text-xs text-muted">Loading…</p>;
  if (!data || data.words.length === 0) return null;

  function handleAdd(word: MissingWorldWord) {
    addWord.mutate(
      { senseId: word.senseId, sourceType: 'world' },
      {
        // Prefix match invalidates BOTH this missing-words query and the ['worlds'] progress
        // query in one call — the progress bar's faded segment must move on this same tap, or
        // `+` still LOOKS like it did nothing.
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['worlds'] }),
      },
    );
  }

  return (
    <>
      <div className={className}>
        {data.words.map((word) => (
          <WordRow key={word.lexemeId} word={word} onOpen={() => setOpenWord(word)} onAdd={() => handleAdd(word)} />
        ))}
      </div>
      {openWord && (
        <WordDetailModal senseId={openWord.senseId} displayLemma={openWord.displayLemma} onClose={() => setOpenWord(null)} />
      )}
    </>
  );
}
