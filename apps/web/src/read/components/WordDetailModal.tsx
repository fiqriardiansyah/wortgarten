import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { SpeakButton } from '@/components/ui/SpeakButton';
import { tokens } from '@/design/tokens';
import { partOfSpeechLabel } from '@/lib/partOfSpeech';
import { useAddWord } from '@/features/add-words/api/useAddWord';
import { useSenseDetail } from '../api/useSenseDetail';

interface WordDetailModalProps {
  senseId: string;
  displayLemma: string;
  onClose: () => void;
}

/** A word tile's "tell me more" modal — same shape as the reader's WordPopup (lemma, translation,
 * POS, one example sentence, "+ Add to my words"), but resolved from a bare senseId instead of a
 * Story's glossary + paragraph, since a missing-world-words tile has neither. */
export function WordDetailModal({ senseId, displayLemma, onClose }: WordDetailModalProps) {
  const { data, isLoading } = useSenseDetail(senseId);
  const addWord = useAddWord();
  const queryClient = useQueryClient();

  // Portaled to `document.body` — this modal is opened from tiles nested inside `Card`, whose
  // wrapping `motion.div` (see `whileHover`) sets an inline `transform`. A `transform` on any
  // ancestor turns it into the containing block for `position: fixed` descendants, which traps
  // this overlay inside that Card's box instead of covering the viewport. Rendering outside the
  // component tree entirely sidesteps that regardless of where the modal gets opened from.
  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 p-4 sm:items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          onClick={(event) => event.stopPropagation()}
          className="w-full max-w-sm"
        >
          <Card hover={false}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <p className="text-lg font-extrabold text-ink">{displayLemma}</p>
                <SpeakButton text={displayLemma} />
              </div>
              <Chip variant="accent">NEW</Chip>
            </div>

            {isLoading || !data ? (
              <p className="mt-3 text-sm text-muted">Loading…</p>
            ) : (
              <>
                <p className="mt-0.5 text-sm text-muted">
                  {data.sense.translation} · {partOfSpeechLabel[data.lexeme.partOfSpeech]}
                </p>
                {data.sense.example && (
                  <p className="mt-3 rounded-xl px-3 py-2 text-sm text-ink" style={{ backgroundColor: tokens.color.tealSoft }}>
                    {data.sense.example}
                  </p>
                )}
              </>
            )}

            <Button
              className="mt-4 w-full justify-center"
              icon={<Sparkles size={16} />}
              disabled={addWord.isPending}
              onClick={() =>
                addWord.mutate(
                  { senseId, sourceType: 'world' },
                  {
                    onSuccess: () => {
                      queryClient.invalidateQueries({ queryKey: ['worlds'] });
                      onClose();
                    },
                  },
                )
              }
            >
              + Add to my words
            </Button>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
