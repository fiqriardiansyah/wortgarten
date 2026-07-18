import { AnimatePresence, motion } from 'motion/react';
import { displayForm } from '@wortgarten/shared';
import type { AnalyzedSenseCandidate } from '@wortgarten/shared';
import { Card } from '@/components/ui/Card';

interface SensePickerModalProps {
  surface: string;
  candidates: AnalyzedSenseCandidate[];
  selectedSenseId?: string;
  onChoose: (senseId: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export function SensePickerModal({
  surface,
  candidates,
  selectedSenseId,
  onChoose,
  onClear,
  onClose,
}: SensePickerModalProps) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[85vh] w-full max-w-sm overflow-y-auto"
        >
          <Card hover={false}>
            <p className="text-sm text-muted">
              Which meaning of <span className="font-bold text-ink">"{surface}"</span> did you mean?
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {candidates.map((candidate) => (
                <button
                  key={candidate.senseId}
                  onClick={() => onChoose(candidate.senseId)}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                    selectedSenseId === candidate.senseId
                      ? 'border-teal bg-teal-soft text-teal-deep'
                      : 'border-line text-ink hover:bg-teal-soft/50'
                  }`}
                >
                  <span className="font-semibold">{displayForm(candidate.lexeme)}</span>
                  <span className="text-muted">{candidate.translation}</span>
                </button>
              ))}
            </div>
            {selectedSenseId && (
              <button onClick={onClear} className="mt-3 text-xs font-semibold text-coral hover:underline">
                Remove from selection
              </button>
            )}
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
