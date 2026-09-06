import { AnimatePresence, motion } from 'motion/react';
import { Check, Sparkles } from 'lucide-react';
import type { StoryGlossaryEntry, StoryParagraph, StoryToken } from '@wortgarten/shared';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { SpeakButton } from '@/components/ui/SpeakButton';
import { tokens } from '@/design/tokens';

interface WordPopupProps {
  glossary: Record<string, StoryGlossaryEntry>;
  token: StoryToken;
  paragraph: StoryParagraph;
  onAdd: (lexemeId: string) => void;
  onClose: () => void;
}

export function WordPopup({ glossary, token, paragraph, onAdd, onClose }: WordPopupProps) {
  const entry = token.lexemeId ? glossary[token.lexemeId] : undefined;
  const sentence = paragraph.tokens.map((t) => t.text).join('');
  const isNew = token.status === 'new';
  // A real lexeme just outside this user's allowlist — comprehensible input, not one of the
  // story's intentional new words, but still addable: same "+ Add to my words" action.
  const isAddable = isNew || token.status === 'unknown';

  return (
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
            {!entry ? (
              // Degrades gracefully if a token's lexemeId doesn't resolve — never crash the reader.
              <p className="text-sm text-ink">"{token.text}"</p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <p className="text-lg font-extrabold text-ink">{entry.displayLemma}</p>
                    <SpeakButton text={entry.displayLemma} />
                  </div>
                  {isNew && <Chip variant="accent">NEW</Chip>}
                </div>
                <p className="mt-0.5 text-sm text-muted">
                  {entry.translation} · {entry.pos}
                </p>

                <p className="mt-3 rounded-xl px-3 py-2 text-sm text-ink" style={{ backgroundColor: tokens.color.tealSoft }}>
                  {sentence}
                </p>

                {isAddable ? (
                  <Button className="mt-4 w-full justify-center" icon={<Sparkles size={16} />} onClick={() => onAdd(entry.lexemeId)}>
                    + Add to my words
                  </Button>
                ) : (
                  <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-muted">
                    {token.status === 'known' ? (
                      <>
                        <Check size={14} className="text-teal" /> You know this word
                      </>
                    ) : (
                      'Common word — no need to review'
                    )}
                  </p>
                )}
              </>
            )}
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
