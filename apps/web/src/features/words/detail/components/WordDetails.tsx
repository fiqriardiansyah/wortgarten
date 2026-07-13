import { useState } from 'react';
import { fullDisplayForm } from '@wortgarten/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { IncompleteBadge } from '@/components/ui/IncompleteBadge';
import { Input } from '@/components/ui/Input';
import { partOfSpeechLabel } from '@/lib/partOfSpeech';
import { ladderLevelChipVariant, ladderLevelLabel } from '@/lib/wordLevel';
import { useWordDetailQuery } from '../api/useWordDetailQuery';
import { useUpdateWord } from '../api/useUpdateWord';
import { useDeleteWord } from '../api/useDeleteWord';
import { MasteryLadder } from './MasteryLadder';

interface WordDetailsProps {
  id: string;
  onDeleted?: () => void;
  sticky?: boolean;
}

/** The single source of truth for word-detail content in both page and panel views. */
export function WordDetails({ id, onDeleted, sticky = false }: WordDetailsProps) {
  const { data: word, isLoading, isError } = useWordDetailQuery(id);
  const updateWord = useUpdateWord();
  const deleteWord = useDeleteWord();
  const [isEditing, setIsEditing] = useState(false);
  const [customTranslation, setCustomTranslation] = useState('');
  const [note, setNote] = useState('');

  if (isLoading) return <p className="py-12 text-center text-sm text-muted">Loading…</p>;
  if (isError || !word) return <p className="py-12 text-center text-sm text-muted">Couldn't find that word.</p>;

  function startEditing() {
    setCustomTranslation(word!.translation);
    setNote(word!.note ?? '');
    setIsEditing(true);
  }

  function saveEdits() {
    updateWord.mutate(
      { id, customTranslation: customTranslation.trim() || null, note: note.trim() || null },
      { onSuccess: () => setIsEditing(false) },
    );
  }

  function handleDelete() {
    if (!window.confirm(`Remove "${word!.lexeme.lemma}" from your words?`)) return;
    deleteWord.mutate(id, { onSuccess: onDeleted });
  }

  return (
    <div className={sticky ? 'sticky top-6' : undefined}>
      <Card hover={false}>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-heading-sm font-extrabold text-deep">{fullDisplayForm(word.lexeme)}</h1>
          <Chip variant="lilac">{partOfSpeechLabel[word.lexeme.partOfSpeech]}</Chip>
          {word.isIncomplete && <IncompleteBadge />}
        </div>

        {(word.lexeme.auxiliary || word.lexeme.government) && (
          <p className="mt-1 text-sm text-muted">
            {word.lexeme.auxiliary && <>auxiliary: {word.lexeme.auxiliary} </>}
            {word.lexeme.government && <>used with: {word.lexeme.government}</>}
          </p>
        )}

        {!isEditing ? (
          <>
            <p className="mt-4 text-lg font-semibold text-deep">{word.translation}</p>
            {word.example && <p className="mt-1 text-sm italic text-muted">“{word.example}”</p>}
            {word.sourceSentence && (
              <div className="mt-3 rounded-xl bg-lilac/50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Where you met it</p>
                <p className="mt-1 text-sm text-deep">“{word.sourceSentence}”</p>
              </div>
            )}
            {word.note && <p className="mt-3 text-sm text-muted">Note: {word.note}</p>}
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="!px-4 !py-1.5 text-sm" onClick={startEditing}>Edit</Button>
              <Button variant="coral" className="!px-4 !py-1.5 text-sm" onClick={handleDelete}>Delete</Button>
            </div>
          </>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <div><label className="text-xs font-semibold text-muted">Your translation</label><Input value={customTranslation} onChange={(event) => setCustomTranslation(event.target.value)} className="mt-1" /></div>
            <div><label className="text-xs font-semibold text-muted">Note</label><Input value={note} onChange={(event) => setNote(event.target.value)} className="mt-1" /></div>
            <div className="flex gap-2"><Button onClick={saveEdits}>{updateWord.isPending ? 'Saving…' : 'Save'}</Button><Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button></div>
          </div>
        )}
      </Card>

      <Card className="mt-4" hover={false}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Mastery</p>
          <Chip variant={ladderLevelChipVariant[word.level]}>{ladderLevelLabel[word.level]}</Chip>
        </div>
        <div className="mt-4"><MasteryLadder level={word.level} /></div>
        <Button variant="light" className="mt-5 w-full justify-center" disabled>Practice — coming soon</Button>
      </Card>

      <Card className="mt-4" hover={false}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">History</p>
        {word.attempts.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing drilled yet — history will show up once you start practicing.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {word.attempts.map((attempt) => <div key={attempt.id} className="flex items-center justify-between text-sm"><span className="text-deep">{attempt.taskType}</span><span className="text-muted">{attempt.result}</span></div>)}
          </div>
        )}
      </Card>
    </div>
  );
}
