import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight } from 'lucide-react';
import type { Story } from '@wortgarten/shared';
import { Chip } from '@/components/ui/Chip';

export function StoryRow({ story }: { story: Story }) {
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
      className="flex w-full items-center gap-3 border-b border-line-soft py-2.5 text-left last:border-b-0"
    >
      {story.coverImageUrl && (
        <img src={story.coverImageUrl} alt="" loading="lazy" className="h-10 w-10 flex-shrink-0 rounded-lg object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-ink">{story.title}</p>
          {!story.isRead && (
            <Chip variant="accent" className="flex-shrink-0">
              NEW
            </Chip>
          )}
          {newCount > 0 && (
            <Chip variant="lilac" className="flex-shrink-0">
              +{newCount} new word{newCount === 1 ? '' : 's'}
            </Chip>
          )}
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <span>{story.estMinutes} min</span>
          {story.isRead && (
            <span className="flex items-center gap-0.5 text-teal">
              <Check size={11} /> read
            </span>
          )}
        </p>
      </div>
      <ChevronRight size={16} className="flex-shrink-0 text-muted" />
    </div>
  );
}
