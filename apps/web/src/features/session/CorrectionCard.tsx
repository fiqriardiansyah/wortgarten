import { motion } from 'motion/react';
import type { SubmitAttemptResponse } from '@wortgarten/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cardEnterTransition, cardEnterVariants } from '@/design/motion';
import { EmphasizedAnswer, RichText } from './richText';

interface CorrectionCardProps {
  userAnswerLabel?: string;
  attempt: SubmitAttemptResponse;
  onGotIt: () => void;
}

/** Screen 4 — the correction appears in place; the prompt card above stays, this replaces the
 * input, and the CTA reads "Got it →" instead of "Check ✓". Coral appears here and nowhere else
 * in the session — never the progress bar, never a button outside this card. */
export function CorrectionCard({ userAnswerLabel, attempt, onGotIt }: CorrectionCardProps) {
  const correction = attempt.correction;
  if (!correction) return null;
  const isLightToast = attempt.result === 'CORRECT_WITH_TYPO';

  return (
    <motion.div variants={cardEnterVariants} initial="hidden" animate="visible" transition={cardEnterTransition()}>
      {userAnswerLabel && !isLightToast && (
        <p className="text-center text-sm font-semibold text-coral">
          <span className="line-through">{userAnswerLabel}</span> <span aria-hidden>✕</span>
        </p>
      )}

      <Card hover={false} className="mt-3 bg-coral/10">
        {!isLightToast && <p className="text-sm font-extrabold text-coral">Not quite!</p>}
        <p className={isLightToast ? 'font-semibold text-deep' : 'mt-1 font-semibold text-deep'}>
          {isLightToast ? (
            <RichText text={correction.tip} />
          ) : (
            <>
              Correct: <EmphasizedAnswer answer={correction.correctAnswer} emphasize={correction.emphasize} />
            </>
          )}
        </p>
        {!isLightToast && (
          <p className="mt-2 text-sm text-deep">
            <RichText text={correction.tip} />
          </p>
        )}
      </Card>

      {attempt.requeued && <p className="mt-2 text-center text-xs text-muted">↻ You'll see this again in a moment</p>}

      <Button className="mt-4 w-full justify-center" onClick={onGotIt}>
        Got it →
      </Button>
    </motion.div>
  );
}
