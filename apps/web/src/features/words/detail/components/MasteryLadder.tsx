import type { LadderLevel } from '@wortgarten/shared';
import { LADDER_STEPS, ladderLevelLabel } from '@/lib/wordLevel';
import { tokens } from '@/design/tokens';

export function MasteryLadder({ level }: { level: LadderLevel }) {
  const currentIndex = LADDER_STEPS.indexOf(level);

  return (
    <div className="flex items-center">
      {LADDER_STEPS.map((step, i) => {
        const reached = i <= currentIndex;
        const isCurrent = i === currentIndex;
        const bubble = isCurrent
          ? { backgroundColor: tokens.color.teal, color: '#FFFFFF' }
          : reached
            ? { backgroundColor: tokens.color.tealSoft, color: tokens.color.tealDeep }
            : { backgroundColor: tokens.color.lineSoft, color: tokens.color.muted };

        return (
          <div key={step} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold" style={bubble}>
                {i + 1}
              </div>
              <span
                className="text-[11px]"
                style={{ color: isCurrent ? tokens.color.ink : tokens.color.muted, fontWeight: isCurrent ? tokens.font.weight.bold : undefined }}
              >
                {ladderLevelLabel[step]}
              </span>
            </div>
            {i < LADDER_STEPS.length - 1 && (
              <div className="mx-1 h-0.5 flex-1" style={{ backgroundColor: i < currentIndex ? tokens.color.teal : tokens.color.line }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
