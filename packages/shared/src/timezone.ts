import { addDays, format, parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

// User-facing day boundaries — always User.timezone, never UTC. Shared by the streak system and
// story generation's daily cadence rule so a "day" means exactly the same thing everywhere in the
// app. (Distinct from @wortgarten/ai's Clock.todayUtcDateKey, which is deliberately UTC-fixed for
// AI quota day boundaries — do not conflate the two.)

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function localDateKey(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, 'yyyy-MM-dd');
}

export function localDayRange(dayKey: string, timezone: string): { start: Date; end: Date } {
  const nextDayKey = format(addDays(parseISO(dayKey), 1), 'yyyy-MM-dd');
  return {
    start: fromZonedTime(`${dayKey}T00:00:00`, timezone),
    end: fromZonedTime(`${nextDayKey}T00:00:00`, timezone),
  };
}
