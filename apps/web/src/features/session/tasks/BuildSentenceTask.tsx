import type { BuildSentencePayload } from '@wortgarten/shared';
import { Card } from '@/components/ui/Card';
import { SpeakButton } from '@/components/ui/SpeakButton';

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
          // Wrapped in a div (not nested in the tile <button>) so the SpeakButton can sit beside
          // it — hearing one tile's pronunciation doesn't reveal the sentence's word order.
          <div key={tile.id} className="relative">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange([...selectedIds, tile.id])}
              className="rounded-lg bg-white py-1.5 pl-3 pr-6 text-sm font-semibold text-deep shadow-card hover:brightness-95 disabled:opacity-60"
            >
              {tile.surface}
            </button>
            <SpeakButton
              text={tile.surface}
              size={11}
              className="absolute right-1 top-1/2 -translate-y-1/2"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
