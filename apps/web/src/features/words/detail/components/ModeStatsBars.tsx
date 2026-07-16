import {
  DRILL_TASK_TYPES,
  TASK_TYPE_ICONS,
  TASK_TYPE_LABELS,
  type StatsByMode,
} from '@wortgarten/shared';

interface ModeStatsBarsProps {
  stats: StatsByMode;
}

export function ModeStatsBars({ stats }: ModeStatsBarsProps) {
  const practicedModes = DRILL_TASK_TYPES.filter((mode) => stats[mode] !== undefined);

  if (practicedModes.length === 0) {
    return <p className="mt-3 text-sm text-muted">Not practiced yet — tap Practice now to start.</p>;
  }

  return (
    <div className="mt-4 flex flex-col gap-5">
      {practicedModes.map((mode) => {
        const stat = stats[mode];
        if (!stat) return null;
        const percentage = stat.total === 0 ? 0 : Math.min(100, Math.max(0, (stat.correct / stat.total) * 100));

        return (
          <div key={mode}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 font-semibold text-deep">
                <span aria-hidden="true" className="w-5 text-center">{TASK_TYPE_ICONS[mode]}</span>
                <span>{TASK_TYPE_LABELS[mode]}</span>
              </span>
              <span className="shrink-0 text-muted">{stat.correct} / {stat.total} right</span>
            </div>
            <div
              className="mt-2 h-2.5 overflow-hidden rounded-pill bg-lilac"
              role="progressbar"
              aria-label={`${TASK_TYPE_LABELS[mode]}: ${stat.correct} of ${stat.total} right`}
              aria-valuemin={0}
              aria-valuemax={stat.total}
              aria-valuenow={stat.correct}
            >
              <div className="h-full rounded-pill bg-success" style={{ width: `${percentage}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
