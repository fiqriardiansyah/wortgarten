import { Link } from 'react-router-dom';
import { displayForm } from '@wortgarten/shared';
import type { WordCard as WordCardData } from '@wortgarten/shared';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { IncompleteBadge } from '@/components/ui/IncompleteBadge';
import { ladderLevelChipVariant, ladderLevelLabel } from '@/lib/wordLevel';

interface WordCardProps {
  word: WordCardData;
  index: number;
}

export function WordCard({ word, index }: WordCardProps) {
  return (
    <Link to={`/words/${word.id}`}>
      <Card index={index} className={word.isRusty ? 'opacity-60' : ''}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-bold text-deep">{displayForm(word.lexeme)}</p>
            <p className="text-sm text-muted">{word.translation}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Chip variant={ladderLevelChipVariant[word.level]}>{ladderLevelLabel[word.level]}</Chip>
            {word.isIncomplete && <IncompleteBadge />}
          </div>
        </div>
      </Card>
    </Link>
  );
}
