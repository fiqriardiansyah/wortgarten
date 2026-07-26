import { useId } from 'react';
import type { Story } from '@wortgarten/shared';
import { SketchBox } from '@/components/ui/SketchBox';
import { tokens } from '@/design/tokens';
import { HeroStoryCard } from '@/read/components/HeroStoryCard';

interface StackedHeroCardProps {
  story: Story;
  /** More than one unread story exists — hint it with a second sketch-box peeking out below,
   * like a card stack. */
  hasMoreUnread: boolean;
}

export function StackedHeroCard({ story, hasMoreUnread }: StackedHeroCardProps) {
  const seed = `hero-stack-${useId()}`;

  return (
    <div className="relative z-0">
      {hasMoreUnread && (
        <div className="absolute inset-x-5 -bottom-3 -z-10 h-9" aria-hidden>
          <SketchBox seed={seed} fill={tokens.color.surface} stroke={tokens.color.ink} className="h-full w-full" />
        </div>
      )}
      <HeroStoryCard story={story} index={0} />
    </div>
  );
}
