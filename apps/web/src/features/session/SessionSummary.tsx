import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import type { SessionCompleteResponse } from '@wortgarten/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatNumber } from '@/components/ui/StatNumber';
import { cardEnterTransition, cardEnterVariants } from '@/design/motion';

interface SessionSummaryProps {
  summary: SessionCompleteResponse;
  onPracticeMore: () => void;
  practicePending: boolean;
}

function minutesLabel(elapsedMs: number): string {
  const minutes = Math.max(1, Math.round(elapsedMs / 60000));
  return `${minutes} minute${minutes === 1 ? '' : 's'} well spent`;
}

function secondCardContent(summary: SessionCompleteResponse): { label: string } | null {
  switch (summary.secondCard.type) {
    case 'incomplete_nouns':
      return { label: `${summary.secondCard.count} word${summary.secondCard.count === 1 ? ' is' : 's are'} missing their article.` };
    case 'stuck_produce':
      return { label: `${summary.secondCard.count} word${summary.secondCard.count === 1 ? ' is' : 's are'} waiting for an example sentence.` };
    case 'next_review':
      return { label: `Next review: ${summary.secondCard.dueLabel}.` };
    case 'none':
      return null;
  }
}

/** Screen 5. `correct` counts first attempts only — a retried-and-passed word is honestly not
 * "correct". There is deliberately no quest card here (no quest table exists); the second slot is
 * one of three honest nudges, or nothing. */
export function SessionSummary({ summary, onPracticeMore, practicePending }: SessionSummaryProps) {
  const navigate = useNavigate();
  const secondCard = secondCardContent(summary);

  return (
    <div className="mx-auto max-w-md text-center">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
        <span className="text-5xl" aria-hidden>
          🎉
        </span>
      </motion.div>
      <h1 className="mt-3 text-heading font-extrabold text-deep">Session done!</h1>
      <p className="mt-1 text-muted">{minutesLabel(summary.elapsedMs)}</p>

      <Card hover={false} className="mt-6">
        <div className="flex items-center justify-around">
          <StatNumber value={summary.practiced} caption="practiced" color="deep" />
          <StatNumber value={summary.correct} caption="correct" color="primary" />
          <StatNumber value={summary.leveledUp} caption="leveled up" color="primary" />
        </div>
      </Card>

      {summary.masteredWords.map((word, i) => (
        <motion.div
          key={word.userWordId}
          variants={cardEnterVariants}
          initial="hidden"
          animate="visible"
          transition={cardEnterTransition(i + 1)}
        >
          <Card hover={false} className="mt-4 bg-gold/10">
            <p className="font-extrabold text-gold">
              🏆 {word.displayForm} is now gold!
            </p>
            <p className="mt-1 text-sm text-deep">You used it in a sentence — it's truly yours now.</p>
          </Card>
        </motion.div>
      ))}

      {secondCard && (
        <Card hover={false} className="mt-4">
          <p className="text-sm text-deep">{secondCard.label}</p>
        </Card>
      )}

      <Button className="mt-6 w-full justify-center" onClick={() => navigate('/', { replace: true })}>
        Done
      </Button>
      <button
        type="button"
        onClick={onPracticeMore}
        disabled={practicePending}
        className="mt-3 text-sm font-semibold text-primary hover:underline disabled:opacity-60"
      >
        Practice 5 more
      </button>
    </div>
  );
}
