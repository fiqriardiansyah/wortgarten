import { useNavigate } from 'react-router-dom';
import { displayForm } from '@wortgarten/shared';
import type { WordCard as WordCardData } from '@wortgarten/shared';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { IncompleteBadge } from '@/components/ui/IncompleteBadge';
import { ladderLevelChipVariant, ladderLevelLabel } from '@/lib/wordLevel';

interface WordCardProps {
  word: WordCardData;
  index: number;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

export function WordCard({ word, index, selected = false, onSelect }: WordCardProps) {
  const navigate = useNavigate();

  function openWord() {
    if (window.matchMedia('(min-width: 1024px)').matches) onSelect?.(word.id);
    else navigate(`/words/${word.id}`);
  }

  return (
    <button type="button" onClick={openWord} className="w-full text-left" aria-pressed={selected}>
      <Card
        index={index}
        className={`!rounded-[18px] border-2 !p-4 transition-colors ${
          selected ? 'border-primary' : 'border-transparent'
        } ${word.isRusty ? 'opacity-60' : ''}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-bold text-deep">{displayForm(word.lexeme)}</p>
            <p className="text-xs text-muted">{word.translation} · {word.lexeme.partOfSpeech}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Chip variant={ladderLevelChipVariant[word.level]}>{ladderLevelLabel[word.level]}</Chip>
            {word.isIncomplete && <IncompleteBadge />}
          </div>
        </div>
      </Card>
    </button>
  );
}
