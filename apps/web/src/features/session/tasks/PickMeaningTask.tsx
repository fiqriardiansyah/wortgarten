import { motion } from 'motion/react';
import type { PickMeaningPayload } from '@wortgarten/shared';
import { Card } from '@/components/ui/Card';
import { SpeakButton } from '@/components/ui/SpeakButton';
import { partOfSpeechLabel } from '@/lib/partOfSpeech';
import { pressSpring } from '@/design/motion';
import { tokens } from '@/design/tokens';

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
        <div className="flex items-center justify-center gap-2">
          <p className="text-hero-sm font-extrabold text-ink">{payload.prompt}</p>
          <SpeakButton text={payload.prompt} size={20} />
        </div>
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
            className="flex w-full items-center gap-3 border-2 border-line bg-surface text-left transition-colors hover:border-teal hover:bg-teal-soft disabled:opacity-60"
            style={{
              borderRadius: tokens.component.optionRow.radius,
              paddingLeft: tokens.component.optionRow.paddingX,
              paddingRight: tokens.component.optionRow.paddingX,
              paddingTop: tokens.component.optionRow.paddingY,
              paddingBottom: tokens.component.optionRow.paddingY,
            }}
          >
            <span
              className="flex shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{
                width: tokens.component.optionRow.keyChipSize,
                height: tokens.component.optionRow.keyChipSize,
                backgroundColor: tokens.color.tealSoft,
                color: tokens.color.tealDeep,
              }}
            >
              {i + 1}
            </span>
            <span className="font-semibold text-ink">{option.label}</span>
          </motion.button>
        ))}
      </div>

      {payload.isNew && <p className="mt-4 text-xs text-muted">new word · first time seeing it 🌱</p>}
    </div>
  );
}
