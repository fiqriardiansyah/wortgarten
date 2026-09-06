import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Brain, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { useForgetMemory, useMemoryNote } from '@/chat/api/useChat';

interface MemoryPanelProps {
  conversationId: string;
  open: boolean;
  onClose: () => void;
}

/** Iteration 5 (memory): "What [name] remembers about you", plus "Forget this" — the user-control
 * half of the memory feature. Reuses WordPopup's/ConfirmModal's sheet-over-backdrop shell so this
 * doesn't need a new modal primitive. */
export function MemoryPanel({ conversationId, open, onClose }: MemoryPanelProps) {
  const { data, isLoading } = useMemoryNote(conversationId, open);
  const forget = useForgetMemory(conversationId);
  const [confirmingForget, setConfirmingForget] = useState(false);

  const hasMemory = !!data && (data.summary.length > 0 || data.facts.length > 0);

  return (
    <>
      <AnimatePresence>
        {open && (
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
                    <Brain size={18} className="text-teal" />
                    <p className="font-extrabold text-ink">
                      What {data?.characterName ?? 'they'} remember{data?.characterName ? 's' : ''} about you
                    </p>
                  </div>
                  <button type="button" onClick={onClose} className="text-muted hover:text-ink">
                    <X size={18} />
                  </button>
                </div>

                {isLoading ? (
                  <p className="mt-3 text-sm text-muted">Loading…</p>
                ) : !hasMemory ? (
                  <p className="mt-3 text-sm text-muted">Nothing remembered yet — keep chatting!</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {data.summary && <p className="text-sm text-ink">{data.summary}</p>}
                    {data.facts.length > 0 && (
                      <ul className="space-y-1">
                        {data.facts.map((fact, i) => (
                          <li key={i} className="text-sm text-muted before:mr-1.5 before:content-['•']">
                            {fact.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {hasMemory && (
                  <button
                    type="button"
                    onClick={() => setConfirmingForget(true)}
                    className="mt-4 text-sm font-semibold text-coral hover:underline"
                  >
                    Forget this
                  </button>
                )}
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        open={confirmingForget}
        title="Forget what this character remembers?"
        description="Your chat history stays exactly as it is — only their memory of you starts fresh."
        confirmLabel="Forget this"
        pending={forget.isPending}
        onConfirm={() =>
          forget.mutate(undefined, {
            onSuccess: () => setConfirmingForget(false),
          })
        }
        onCancel={() => setConfirmingForget(false)}
      />
    </>
  );
}
