import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import type { Story } from '@wortgarten/shared';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { StoryCoverBanner } from '@/components/ui/StoryCoverBanner';

interface HeroStoryCardProps {
  story: Story;
  index: number;
}

/** First few non-function content words, in reading order — the little "der Hund · laufen ·
 * schnell" preview chips. Purely derived from tokens already on the story, not a new field. */
function contentWordChips(story: Story): string[] {
  const seen = new Set<string>();
  const chips: string[] = [];
  for (const paragraph of story.paragraphs) {
    for (const token of paragraph.tokens) {
      if (token.kind !== 'word' || token.status === 'function' || !token.lexemeId) continue;
      if (seen.has(token.lexemeId)) continue;
      const entry = story.glossary[token.lexemeId];
      if (!entry) continue;
      seen.add(token.lexemeId);
      chips.push(entry.displayLemma);
      if (chips.length >= 4) return chips;
    }
  }
  return chips;
}

export function HeroStoryCard({ story, index }: HeroStoryCardProps) {
  const navigate = useNavigate();

  return (
    <Card index={index}>
      {story.coverImageUrl && (
        <StoryCoverBanner
          src={story.coverImageUrl}
          alt={`${story.title} — ${(story.translation ?? '').slice(0, 60)}`}
          height={120}
          className="mb-3"
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {story.isNewToday && <Chip variant="lilac">NEW TODAY</Chip>}
        {story.coverageKnownPct === 100 && <Chip variant="success">100% your words</Chip>}
        <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-muted">
          <BookOpen size={13} /> {story.estMinutes} min read
        </span>
      </div>

      <h2 className="mt-3 text-heading font-extrabold text-ink">{story.title}</h2>
      {story.blurb && <p className="mt-1 text-sm text-muted">{story.blurb}</p>}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {contentWordChips(story).map((label) => (
          <Chip key={label} variant="lilac">
            {label}
          </Chip>
        ))}
      </div>

      <Button className="mt-4" onClick={() => navigate(`/read/${story.id}`)}>
        Read now →
      </Button>
    </Card>
  );
}
