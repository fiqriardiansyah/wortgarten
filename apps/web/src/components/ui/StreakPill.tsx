import { tokens } from '@/design/tokens';

interface StreakPillProps {
  days: number;
  compact?: boolean;
}

export function StreakPill({ days, compact = false }: StreakPillProps) {
  return (
    <div
      className="inline-flex items-center gap-1 border-2"
      style={{
        backgroundColor: tokens.concept.streak.fill,
        borderColor: tokens.color.yellow,
        borderRadius: tokens.sketch.radiusB,
        paddingLeft: tokens.component.chip.paddingX + 2,
        paddingRight: tokens.component.chip.paddingX + 2,
        paddingTop: tokens.component.chip.paddingY + 2,
        paddingBottom: tokens.component.chip.paddingY + 2,
      }}
    >
      <span>🔥</span>
      {compact ? (
        <span className="text-sm font-bold" style={{ color: tokens.concept.streak.text }}>
          {days === 0 ? 'Start' : days}
        </span>
      ) : (
        <span className="text-sm font-semibold" style={{ color: tokens.concept.streak.text }}>
          {days === 0 ? 'Start a streak' : `${days}`}
        </span>
      )}
    </div>
  );
}
