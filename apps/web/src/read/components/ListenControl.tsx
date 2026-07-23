import { Pause, Play } from 'lucide-react';
import type { ListenSpeed } from '@/read/useListenAudio';

interface ListenControlProps {
  isPlaying: boolean;
  onToggle: () => void;
  speed: ListenSpeed;
  onSpeedChange: (speed: ListenSpeed) => void;
}

const SPEEDS: ListenSpeed[] = [0.75, 1];

/** Rendered only when the story has audio (`story.audioUrl` non-null — see `ReaderTopBar`). Owns
 * no audio state itself; `ReaderPage` owns `useListenAudio` so the same playback position can also
 * drive `StoryBody`'s word/sentence highlight. */
export function ListenControl({ isPlaying, onToggle, speed, onSpeedChange }: ListenControlProps) {
  return (
    <div className="flex flex-shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-label={isPlaying ? 'Pause narration' : 'Play narration'}
        aria-pressed={isPlaying}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-teal text-white transition-transform active:scale-95"
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
      </button>

      <div className="flex items-center gap-0.5 rounded-pill border-2 border-line bg-surface px-1 py-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSpeedChange(s)}
            aria-label={`${s}x speed`}
            aria-pressed={speed === s}
            className={`rounded-pill px-1.5 py-0.5 text-xs font-bold transition-colors ${
              speed === s ? 'bg-teal text-white' : 'text-muted hover:text-ink'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
