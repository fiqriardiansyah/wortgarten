import { useGermanVoice } from '@/lib/useGermanVoice';
import { useTtsPreference } from '@/lib/useTtsPreference';
import { tokens } from '@/design/tokens';

/** Same rule as the pronunciation button itself: never offer a toggle for something that can't
 * actually work on this device. */
export function TtsToggleRow() {
  const { supported } = useGermanVoice();
  const { enabled, setEnabled } = useTtsPreference();

  if (!supported) return null;

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="font-bold" style={{ color: tokens.color.ink }}>
          Pronunciation
        </p>
        <p className="text-sm text-muted">Hear German words spoken aloud (🔊)</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Toggle pronunciation"
        onClick={() => setEnabled(!enabled)}
        className="relative h-7 w-12 shrink-0 rounded-full border-2 transition-colors"
        style={{
          backgroundColor: enabled ? tokens.color.teal : tokens.color.lineSoft,
          borderColor: enabled ? tokens.color.teal : tokens.color.line,
        }}
      >
        <span
          className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-all"
          style={{ left: enabled ? 'calc(100% - 22px)' : '2px' }}
        />
      </button>
    </div>
  );
}
