import { useState } from 'react';
import { tokens } from '@/design/tokens';
import { useSetTimezone } from '../api/useSetTimezone';
import { SavedIndicator } from './SavedIndicator';

// Safety net for browsers old enough to lack `Intl.supportedValuesOf` — every browser this app
// actually targets (Chrome/Edge/Firefox/Safari 2020+) has it.
const FALLBACK_TIMEZONES = [
  'UTC',
  'Europe/Berlin',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Asia/Jakarta',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
];

function getSupportedTimezones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  if (typeof intl.supportedValuesOf === 'function') {
    try {
      return intl.supportedValuesOf('timeZone');
    } catch {
      // fall through
    }
  }
  return FALLBACK_TIMEZONES;
}

const DETECTED = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const ZONES = Array.from(new Set([...getSupportedTimezones(), DETECTED])).sort();

export function TimezoneRow({ timezone }: { timezone: string }) {
  const [savedTick, setSavedTick] = useState(0);
  const mutation = useSetTimezone();

  function save(next: string) {
    if (next === timezone) return;
    mutation.mutate(next, { onSuccess: () => setSavedTick((t) => t + 1) });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold" style={{ color: tokens.color.ink }}>
          Timezone
        </p>
        <SavedIndicator tick={savedTick} />
      </div>
      <p className="text-sm text-muted">Your streak and daily story use this.</p>

      <select
        value={timezone}
        onChange={(e) => save(e.target.value)}
        disabled={mutation.isPending}
        className="rounded-sketch border-2 bg-surface px-3 py-2 text-sm font-semibold"
        style={{ borderColor: tokens.color.line, color: tokens.color.ink }}
      >
        {ZONES.map((zone) => (
          <option key={zone} value={zone}>
            {zone.replace(/_/g, ' ')}
          </option>
        ))}
      </select>

      {DETECTED !== timezone && (
        <button
          type="button"
          onClick={() => save(DETECTED)}
          disabled={mutation.isPending}
          className="self-start text-sm font-bold text-teal hover:underline"
        >
          Detected: {DETECTED.replace(/_/g, ' ')} — use this
        </button>
      )}

      {mutation.isError && (
        <p className="text-xs font-semibold text-coral">Could not save timezone. Try again.</p>
      )}
    </div>
  );
}
