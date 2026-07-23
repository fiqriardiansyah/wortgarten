import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { BookOpen, ChevronRight, Sparkles, Sprout } from 'lucide-react';
import type { HomeStoryCard } from '@wortgarten/shared';
import { useCreateSession } from '@/features/session/api/useCreateSession';

interface StoryCardProps {
  story: HomeStoryCard;
  index: number;
}

export function StoryCard({ story, index }: StoryCardProps) {
  const navigate = useNavigate();
  const createSession = useCreateSession();

  async function handleStartSession() {
    const result = await createSession.mutateAsync();
    if (result.kind === 'session') navigate('/session', { state: { session: result.session } });
  }

  if (story.state === 'generating') {
    return (
      <Card index={index} hover={false}>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 animate-pulse items-center justify-center rounded-full bg-teal-soft">
            <Sparkles size={18} className="text-teal" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink text-sm">Today's story is on its way</p>
            <p className="text-xs text-muted">Writing it now from your newest words — this'll update on its own</p>
          </div>
        </div>
      </Card>
    );
  }

  if (story.state === 'waitingTomorrow') {
    return (
      <Card index={index} hover={false}>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal-soft">
            <BookOpen size={18} className="text-teal" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink text-sm">Today's story is done</p>
            <p className="text-xs text-muted">New story tomorrow</p>
          </div>
        </div>
      </Card>
    );
  }

  if (story.state === 'locked') {
    return (
      <Card index={index} hover={false}>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal-soft">
            <Sprout size={18} className="text-teal" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink text-sm">
              {story.needsPractice ? 'Practice your words to unlock your first story' : 'Add a few more words to unlock your first story'}
            </p>
            <p className="text-xs text-muted">{story.wordsToGo} more words to go</p>
          </div>
          {story.needsPractice ? (
            <Button
              variant="light"
              className="flex-shrink-0 text-xs px-4 py-2"
              disabled={createSession.isPending}
              onClick={handleStartSession}
            >
              Start session
            </Button>
          ) : (
            <Button variant="light" className="flex-shrink-0 text-xs px-4 py-2" onClick={() => navigate('/add')}>
              Add word
            </Button>
          )}
        </div>
      </Card>
    );
  }

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
      <Card index={index}>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal-soft">
            <BookOpen size={18} className="text-teal" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="truncate font-bold text-ink">{story.title}</h3>
              {story.isNewToday && <Chip variant="accent">NEW</Chip>}
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {story.isFullyKnown ? '100% your words · ' : ''}
              {story.estMinutes} min
            </p>
          </div>
          <ChevronRight size={18} className="flex-shrink-0 text-muted" />
        </div>
      </Card>
    </div>
  );
}
