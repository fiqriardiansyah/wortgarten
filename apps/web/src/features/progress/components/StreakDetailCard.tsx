import { useEffect, useState } from 'react';
import { Flame, Snowflake } from 'lucide-react';
import { animate, motion, useReducedMotion } from 'motion/react';
import type { ProgressStreak, StreakWeek, StreakWeekDayState } from '@wortgarten/shared';
import { Card } from '@/components/ui/Card';

interface StreakDetailCardProps {
  week?: StreakWeek;
  streak: ProgressStreak;
  index: number;
}

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

function parseLocalDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Keeps the page usable across a rolling deploy or an HMR cache holding the pre-week response. */
function buildLegacyWeek(streak: ProgressStreak): StreakWeek {
  const calendarToday = streak.calendar[streak.calendar.length - 1]?.date;
  const today = calendarToday ? parseLocalDate(calendarToday) : new Date();
  const todayKey = formatDateKey(today);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const calendarByDate = new Map(streak.calendar.map((day) => [day.date, day.state]));
  let freezeSpentThisWeek: StreakWeek['freezeSpentThisWeek'] = null;

  const days = WEEKDAY_LABELS.map((label, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const dateKey = formatDateKey(date);
    const calendarState = calendarByDate.get(dateKey);
    const isToday = dateKey === todayKey;
    const isLearned = calendarState === 'completed';
    let state: StreakWeekDayState;

    if (isToday) state = 'today';
    else if (calendarState === 'completed') state = 'learned';
    else if (calendarState === 'frozen') state = 'frozen';
    else if (dateKey > todayKey) state = 'future';
    else state = 'missed';

    if (calendarState === 'frozen') {
      freezeSpentThisWeek = {
        dayLabel: new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(date),
      };
    }

    return { label, state, isToday, isLearned };
  });

  return {
    todayLabel: new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    }).format(today),
    currentStreak: streak.current,
    freezesLeft: streak.freezesBanked,
    days,
    freezeSpentThisWeek,
  };
}

function AnimatedStreak({ value }: { value: number }) {
  const reduceMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(reduceMotion ? value : 0);

  useEffect(() => {
    if (reduceMotion) {
      setDisplayValue(value);
      return;
    }

    const controls = animate(0, value, {
      duration: 0.7,
      ease: 'easeOut',
      onUpdate: (latest) => setDisplayValue(Math.round(latest)),
    });
    return () => controls.stop();
  }, [reduceMotion, value]);

  return <span>{displayValue}</span>;
}

export function StreakDetailCard({ week, streak, index }: StreakDetailCardProps) {
  const reduceMotion = useReducedMotion();
  const resolvedWeek = week ?? buildLegacyWeek(streak);
  const savedDay = resolvedWeek.freezeSpentThisWeek?.dayLabel;

  return (
    <Card index={index} hover={false}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-bold text-deep sm:text-heading-sm">{resolvedWeek.todayLabel}</h2>
        <div
          className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-lilac px-3.5 py-2 text-sm font-extrabold text-deep"
          aria-label={`${resolvedWeek.currentStreak} day streak`}
        >
          <AnimatedStreak value={resolvedWeek.currentStreak} />
          <Flame className="h-4 w-4 fill-accent text-accent" aria-hidden="true" />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-7 gap-1 sm:gap-2" aria-label="Current streak week">
        {resolvedWeek.days.map((day, dayIndex) => {
          const showFlame = day.state === 'learned' || (day.isToday && day.isLearned);
          const showSnowflake = day.state === 'frozen';
          const circleTone = day.isToday
            ? 'border-primary bg-primary'
            : showFlame || showSnowflake
              ? 'border-lilac bg-lilac'
              : 'border-muted/30 bg-transparent';

          return (
            <motion.div
              key={day.label}
              className="flex min-w-0 flex-col items-center gap-2"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.7, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22, delay: reduceMotion ? 0 : dayIndex * 0.06 }}
            >
              <motion.div
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 sm:h-11 sm:w-11 ${circleTone}`}
                animate={day.isToday && !reduceMotion ? { scale: [1, 1.05, 1] } : undefined}
                transition={day.isToday && !reduceMotion ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } : undefined}
                aria-label={`${day.label}: ${day.isToday && day.isLearned ? 'learned today' : day.state}`}
              >
                {showFlame && <Flame className="h-5 w-5 fill-accent text-accent" aria-hidden="true" />}
                {showSnowflake && <Snowflake className="h-5 w-5 text-primary" aria-hidden="true" />}
                {day.isToday && !day.isLearned && <span className="h-3 w-3 rounded-full border-2 border-white/80" />}
              </motion.div>
              <span className={`text-xs ${day.isToday ? 'font-extrabold text-primary' : 'font-semibold text-muted'}`}>
                {day.label}
              </span>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-5 flex items-start gap-2 border-t border-lilac pt-4 text-xs leading-relaxed text-muted">
        <Snowflake className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p>
          {savedDay
            ? `A freeze saved your streak on ${savedDay}.`
            : resolvedWeek.freezesLeft > 0
              ? `${resolvedWeek.freezesLeft} freeze day${resolvedWeek.freezesLeft === 1 ? '' : 's'} left — a missed day won't break you.`
              : 'No freeze days banked — learn 7 days to earn one.'}
        </p>
      </div>
    </Card>
  );
}
