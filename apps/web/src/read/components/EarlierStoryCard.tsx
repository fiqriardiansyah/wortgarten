import { useNavigate } from 'react-router-dom';
import { Check, Clock } from 'lucide-react';
import type { Story } from '@wortgarten/shared';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { StoryCoverBanner } from '@/components/ui/StoryCoverBanner';

interface EarlierStoryCardProps {
  story: Story;
  index: number;
}

export function EarlierStoryCard({ story, index }: EarlierStoryCardProps) {
  const navigate = useNavigate();
  const newCount = story.newWords.length;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/read/${story.id}`)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        navigate(`/read/${story.id}`);
      }}
      className="w-full text-left"
    >
      <Card index={index} className="h-full">
        {story.coverImageUrl && (
          <StoryCoverBanner
            src={story.coverImageUrl}
            alt={`${story.title} — ${(story.translation ?? '').slice(0, 60)}`}
            height={80}
            className="mb-3"
          />
        )}
        <h3 className="font-bold text-ink">{story.title}</h3>
        {story.blurb && <p className="mt-1 text-sm text-muted line-clamp-2">{story.blurb}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {newCount > 0 ? (
            <Chip variant="lilac">
              +{newCount} new word{newCount === 1 ? '' : 's'}
            </Chip>
          ) : (
            story.coverageKnownPct === 100 && <Chip variant="success">100% your words</Chip>
          )}
          <span className="flex items-center gap-1 text-xs font-semibold text-muted">
            <Clock size={12} /> {story.estMinutes} min
          </span>
          {story.isRead && (
            <span className="flex items-center gap-1 text-xs font-semibold text-teal">
              <Check size={12} /> read
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
