import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BookOpen, ChevronRight } from 'lucide-react';
import type { StoryTeaser } from '@wortgarten/shared';

interface StoryCardProps {
  story: StoryTeaser;
  index: number;
}

export function StoryCard({ story, index }: StoryCardProps) {
  const { title, coverage, minutes } = story;

  return (
    <Card index={index}>
      {/* Desktop layout */}
      <div className="hidden lg:flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal-soft">
            <BookOpen size={18} className="text-teal" />
          </div>
          <div>
            <h3 className="font-bold text-ink">New story ready: '{title}'</h3>
            <p className="mt-0.5 text-sm text-muted">{coverage} your words · {minutes} min read</p>
          </div>
        </div>
        <Button variant="outline" className="flex-shrink-0 text-xs px-4 py-2">
          Read now
        </Button>
      </div>

      {/* Mobile compact row */}
      <div className="flex items-center gap-3 lg:hidden">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal-soft">
          <BookOpen size={18} className="text-teal" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink text-sm">New story: '{title}'</p>
          <p className="text-xs text-muted">{coverage} your words · {minutes} min</p>
        </div>
        <ChevronRight size={18} className="flex-shrink-0 text-muted" />
      </div>
    </Card>
  );
}
