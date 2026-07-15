import type { BuildSentencePayload } from '@wortgarten/shared';
import { Card } from '@/components/ui/Card';

interface BuildSentenceTaskProps {
  payload: BuildSentencePayload;
  selectedIds: string[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
}

/** Screen 3. Tap tiles in order to build the sentence; tap a placed tile to remove it (or Backspace
 * removes the last one — wired at the shell level, both call the same onChange). The trailing
 * period is pinned, never a tile. */
export function BuildSentenceTask({ payload, selectedIds, disabled, onChange }: BuildSentenceTaskProps) {
  const selectedSet = new Set(selectedIds);
  const available = payload.tiles.filter((tile) => !selectedSet.has(tile.id));
  const selectedTiles = selectedIds
    .map((id) => payload.tiles.find((tile) => tile.id === id))
    .filter((tile): tile is { id: string; surface: string } => !!tile);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Build the sentence</p>

      <Card hover={false} className="mt-3 text-center">
        <p className="text-hero-sm font-extrabold text-deep">{payload.promptTranslation}</p>
      </Card>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Tap the tiles in order</p>
      <div className="mt-2 flex min-h-[52px] flex-wrap items-center gap-2 rounded-xl border-2 border-dashed border-lilac p-3">
        {selectedTiles.map((tile, i) => (
          <button
            key={tile.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(selectedIds.filter((_, idx) => idx !== i))}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {tile.surface}
          </button>
        ))}
        {payload.trailingPeriodPinned && <span className="font-semibold text-deep">.</span>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {available.map((tile) => (
          <button
            key={tile.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange([...selectedIds, tile.id])}
            className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-deep shadow-card hover:brightness-95 disabled:opacity-60"
          >
            {tile.surface}
          </button>
        ))}
      </div>
    </div>
  );
}
