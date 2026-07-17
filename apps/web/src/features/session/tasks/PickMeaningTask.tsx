import { motion } from 'motion/react';
import type { PickMeaningPayload } from '@wortgarten/shared';
import { Card } from '@/components/ui/Card';
import { partOfSpeechLabel } from '@/lib/partOfSpeech';
import { pressSpring } from '@/design/motion';

interface PickMeaningTaskProps {
  payload: PickMeaningPayload;
  disabled: boolean;
  onSelect: (senseId: string) => void;
}

/** Screen 1. Numbers aren't decoration — they're the 1-4 keyboard shortcut affordance. */
export function PickMeaningTask({ payload, disabled, onSelect }: PickMeaningTaskProps) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">What does this mean?</p>

      <Card hover={false} className="mt-3 text-center">
        <p className="text-hero-sm font-extrabold text-deep">{payload.prompt}</p>
        <p className="mt-1 text-sm text-muted">{partOfSpeechLabel[payload.partOfSpeech]}</p>
      </Card>

      <div className="mt-4 flex flex-col gap-2">
        {payload.options.map((option, i) => (
          <motion.button
            key={option.senseId}
            type="button"
            disabled={disabled}
            whileTap={disabled ? undefined : { scale: 0.96 }}
            transition={pressSpring}
            onPointerDown={() => !disabled && onSelect(option.senseId)}
            className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 text-left shadow-card transition-colors hover:brightness-95 disabled:opacity-60"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lilac text-xs font-bold text-primary">{i + 1}</span>
            <span className="font-semibold text-deep">{option.label}</span>
          </motion.button>
        ))}
      </div>

      {payload.isNew && <p className="mt-4 text-xs text-muted">new word · first time seeing it 🌱</p>}
    </div>
  );
}
