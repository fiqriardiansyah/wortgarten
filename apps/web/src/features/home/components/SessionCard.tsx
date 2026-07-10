import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Play } from 'lucide-react';
import type { SessionSummary } from '@wortgarten/shared';

interface SessionCardProps {
  session: SessionSummary;
  index: number;
}

export function SessionCard({ session, index }: SessionCardProps) {
  const { wordCount, estMinutes, taskBreakdown, previewWords } = session;
  const { flashcards, recalls, sentenceBuilds } = taskBreakdown;

  return (
    <Card tone="primary" index={index}>
      <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">Today's session</p>
      <h2 className="mt-2 text-[32px] font-extrabold text-white leading-tight">
        {wordCount} words waiting
      </h2>
      <p className="mt-1 text-sm text-white/80">
        ≈ {estMinutes} min · {flashcards} flashcards · {recalls} recalls · {sentenceBuilds} sentence builds
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {previewWords.map((w) => (
          <Chip key={w} variant="lilac" className="bg-white/20 text-white">
            {w}
          </Chip>
        ))}
      </div>

      <div className="mt-4">
        <Button variant="light" pulse icon={<Play size={14} />}>
          Start session
        </Button>
      </div>
    </Card>
  );
}
