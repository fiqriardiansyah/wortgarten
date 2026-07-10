import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Link } from 'react-router-dom';
import type { WordSummary } from '@wortgarten/shared';
import { wordLevelChipVariant, wordLevelLabel } from '@/lib/wordLevel';

interface RecentlyAddedCardProps {
  words: WordSummary[];
  index: number;
}

export function RecentlyAddedCard({ words, index }: RecentlyAddedCardProps) {
  return (
    <Card index={index}>
      <h3 className="font-bold text-deep mb-3">Recently added</h3>
      <div className="flex flex-col gap-2.5">
        {words.map((word, i) => (
          <div key={word.german + i} className="flex items-center justify-between">
            <div>
              <span className="font-semibold text-deep text-sm">{word.german}</span>
              <span className="text-muted text-sm"> / {word.native}</span>
            </div>
            <Chip variant={wordLevelChipVariant[word.level]}>
              {wordLevelLabel[word.level]}
            </Chip>
          </div>
        ))}
      </div>
      <Link
        to="/words"
        className="mt-4 block text-sm font-semibold text-primary hover:underline"
      >
        View all words →
      </Link>
    </Card>
  );
}
