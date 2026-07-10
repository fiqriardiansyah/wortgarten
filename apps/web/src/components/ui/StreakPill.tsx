interface StreakPillProps {
  days: number;
  compact?: boolean;
}

export function StreakPill({ days, compact = false }: StreakPillProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-pill bg-white px-3 py-1.5 shadow-card">
      <span>🔥</span>
      {compact ? (
        <span className="font-bold text-deep text-sm">{days}</span>
      ) : (
        <span className="font-semibold text-deep text-sm">{days} day streak</span>
      )}
    </div>
  );
}
