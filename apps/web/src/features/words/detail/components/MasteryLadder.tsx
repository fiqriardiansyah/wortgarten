import type { LadderLevel } from '@wortgarten/shared';
import { LADDER_STEPS, ladderLevelLabel } from '@/lib/wordLevel';

export function MasteryLadder({ level }: { level: LadderLevel }) {
  const currentIndex = LADDER_STEPS.indexOf(level);

  return (
    <div className="flex items-center">
      {LADDER_STEPS.map((step, i) => {
        const reached = i <= currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={step} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                  isCurrent
                    ? 'bg-primary text-white'
                    : reached
                      ? 'bg-lilac text-primary'
                      : 'bg-gray-100 text-muted'
                }`}
              >
                {i + 1}
              </div>
              <span className={`text-[11px] ${isCurrent ? 'font-bold text-deep' : 'text-muted'}`}>
                {ladderLevelLabel[step]}
              </span>
            </div>
            {i < LADDER_STEPS.length - 1 && (
              <div className={`mx-1 h-0.5 flex-1 ${i < currentIndex ? 'bg-primary' : 'bg-gray-100'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
