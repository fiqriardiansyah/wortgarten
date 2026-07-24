import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { WorldProgress } from '@wortgarten/shared';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { tokens } from '@/design/tokens';
import { useAddWord } from '@/features/add-words/api/useAddWord';
import { useCreateSession } from '@/features/session/api/useCreateSession';
import { useWorlds } from '../api/useWorlds';
import { useMissingWorldWords } from '../api/useMissingWorldWords';

interface WorldsCardProps {
  index: number;
}

/** Two-tone bar: solid teal = haveCount (RECOGNIZE+, counts toward the unlock), soft teal = words
 * already added but still NEW (not yet counting) — makes `+ Add` visibly do something immediately
 * instead of a word silently vanishing into nothing. */
function WorldProgressBar({ haveCount, addedCount, requiredCount }: { haveCount: number; addedCount: number; requiredCount: number }) {
  const havePct = requiredCount === 0 ? 100 : Math.min((haveCount / requiredCount) * 100, 100);
  const addedPct = requiredCount === 0 ? 0 : Math.min((addedCount / requiredCount) * 100, 100 - havePct);

  return (
    <div
      className="w-full overflow-hidden rounded-pill"
      style={{ height: tokens.component.progressBar.height, backgroundColor: tokens.color.line }}
    >
      <div className="flex h-full">
        <div className="h-full" style={{ width: `${havePct}%`, backgroundColor: tokens.color.teal }} />
        <div className="h-full" style={{ width: `${addedPct}%`, backgroundColor: tokens.color.tealSoft }} />
      </div>
    </div>
  );
}

function knownWordsLine(world: WorldProgress): string | null {
  if (world.haveCount === 0) return null;
  const names = world.knownWords.map((w) => w.displayLemma).join(', ');
  const extra = world.haveCount - world.knownWords.length;
  return extra > 0 ? `You know: ${names}, +${extra} more` : `You know: ${names}`;
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

function MissingWorldWords({ worldKey }: { worldKey: string }) {
  const { data, isLoading } = useMissingWorldWords(worldKey);
  const addWord = useAddWord();
  const queryClient = useQueryClient();

  if (isLoading) return <p className="mt-3 text-xs text-muted">Loading…</p>;
  if (!data || data.words.length === 0) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {data.words.map((word) => (
        <div key={word.lexemeId} className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink">{word.displayLemma}</span>
          <Button
            variant="outline"
            className="!px-3 !py-1 text-xs"
            onClick={() =>
              addWord.mutate(
                { senseId: word.senseId, sourceType: 'world' },
                {
                  // Prefix match invalidates BOTH this missing-words query and the ['worlds']
                  // progress query in one call — the progress bar's faded segment must move on
                  // this same tap, or `+ Add` still LOOKS like it did nothing.
                  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['worlds'] }),
                },
              )
            }
          >
            + Add
          </Button>
        </div>
      ))}
    </div>
  );
}
