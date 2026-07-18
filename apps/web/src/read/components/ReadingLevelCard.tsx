import { Card } from '@/components/ui/Card';
import { LinearProgress } from '@/components/ui/LinearProgress';
import { tokens } from '@/design/tokens';
import type { ReadingLevel } from '@wortgarten/shared';

interface ReadingLevelCardProps {
  level: ReadingLevel;
  index: number;
}

export function ReadingLevelCard({ level, index }: ReadingLevelCardProps) {
  const { wordsUnlocked, nextThreshold, nextUnlockLabel, wordsToGo } = level;

  return (
    <Card index={index}>
      <p className="text-sm font-bold text-deep">Your reading level</p>
      <p className="mt-2 text-hero-sm font-extrabold text-primary">{wordsUnlocked}</p>
      <p className="text-xs text-muted">words unlocked · longer stories at {nextThreshold}</p>
      <div className="mt-3">
        <LinearProgress value={wordsUnlocked} max={nextThreshold} color={tokens.colors.success} />
      </div>
      <p className="mt-2 text-xs text-muted">
        {wordsToGo} more words to unlock {nextUnlockLabel}
      </p>
    </Card>
  );
}
