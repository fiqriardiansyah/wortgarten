import { useNavigate } from 'react-router-dom';
import { displayForm } from '@wortgarten/shared';
import type { WordCard as WordCardData } from '@wortgarten/shared';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { IncompleteBadge } from '@/components/ui/IncompleteBadge';
import { SpeakButton } from '@/components/ui/SpeakButton';
import { ladderLevelChipVariant, ladderLevelLabel } from '@/lib/wordLevel';
import { tokens } from '@/design/tokens';

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
    // A native <button> can't host the nested <SpeakButton>, so this replicates button semantics
    // by hand: role, tabIndex, and Enter/Space activation.
    <div
      role="button"
      tabIndex={0}
      onClick={openWord}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openWord();
      }}
      className="w-full text-left"
      aria-pressed={selected}
    >
      <Card
        index={index}
        className="!p-4"
        stroke={selected ? tokens.color.teal : tokens.color.ink}
        style={word.isRusty ? { opacity: tokens.concept.word.rusty.opacity } : undefined}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-bold text-ink">{displayForm(word.lexeme)}</p>
              <SpeakButton text={displayForm(word.lexeme)} size={14} />
            </div>
            <p className="text-xs text-muted">{word.translation} · {word.lexeme.partOfSpeech}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Chip variant={ladderLevelChipVariant[word.level]}>{ladderLevelLabel[word.level]}</Chip>
            {word.isIncomplete && <IncompleteBadge />}
          </div>
        </div>
      </Card>
    </div>
  );
}
