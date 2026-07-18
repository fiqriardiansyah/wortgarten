import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import type { Story } from '@wortgarten/shared';

interface PickedUpCardProps {
  stories: Story[];
  index: number;
}

export function PickedUpCard({ stories, index }: PickedUpCardProps) {
  const readyStories = stories.filter((story) => story.status === 'READY');
  const totalNewWords = readyStories.reduce((sum, story) => sum + story.newWords.length, 0);

  const picks = readyStories
    .flatMap((story) => story.newWords.map((lexemeId) => ({ story, entry: story.glossary[lexemeId] })))
    .filter((pick): pick is { story: Story; entry: NonNullable<Story['glossary'][string]> } => Boolean(pick.entry))
    .slice(0, 3);

  if (picks.length === 0) return null;

  return (
    <Card index={index}>
      <p className="text-sm font-bold text-ink">Picked up while reading</p>
      <div className="mt-3 flex flex-col gap-3">
        {picks.map(({ story, entry }) => (
          <div key={`${story.id}-${entry.lexemeId}`} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{entry.displayLemma}</p>
              <p className="truncate text-xs text-muted">from {story.title}</p>
            </div>
            <Chip variant="lilac" className="flex-shrink-0">
              {entry.translation}
            </Chip>
          </div>
        ))}
      </div>
      {totalNewWords > 0 && (
        <p className="mt-3 text-xs font-semibold text-teal">
          Reading added {totalNewWords} word{totalNewWords === 1 ? '' : 's'} this month 🌱
        </p>
      )}
    </Card>
  );
}
