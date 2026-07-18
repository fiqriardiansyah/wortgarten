import { motion } from 'motion/react';
import { Sprout } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { SessionCompleteResponse } from '@wortgarten/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SpeakButton } from '@/components/ui/SpeakButton';
import { StatNumber } from '@/components/ui/StatNumber';
import { IllustrationSlot } from '@/components/ui/IllustrationSlot';
import { cardEnterTransition, cardEnterVariants } from '@/design/motion';
import { tokens } from '@/design/tokens';
import { useHomeQuery } from '@/features/home/api/useHomeQuery';

interface SessionSummaryProps {
  summary: SessionCompleteResponse;
  onStartNext: () => void;
  startNextPending: boolean;
  onPracticeMore: () => void;
  practicePending: boolean;
}

function wordsLabel(n: number): string {
  return `${n} word${n === 1 ? '' : 's'}`;
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
export function SessionSummary({ summary, onStartNext, startNextPending, onPracticeMore, practicePending }: SessionSummaryProps) {
  const navigate = useNavigate();
  const { data: home } = useHomeQuery();
  const secondCard = secondCardContent(summary);

  return (
    <div className="mx-auto max-w-md text-center">
      <motion.div
        className="mx-auto flex justify-center"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <IllustrationSlot label="session complete" width={160} height={120} />
      </motion.div>
      <h1 className="mt-3 text-heading font-extrabold text-ink">Session done!</h1>
      <p className="mt-1 text-muted">{minutesLabel(summary.elapsedMs)}</p>

      {home?.streak.learnedToday && (
        <p className="mt-3 font-extrabold text-yellow-deep">
          🔥 {home.streak.current}
        </p>
      )}

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
          <Card hover={false} className="mt-4" fill={tokens.color.tealSoft} stroke={tokens.color.teal}>
            <p className="flex items-center justify-center gap-1.5 font-extrabold text-teal-deep">
              🏆 {word.displayForm} is mastered!
              <SpeakButton text={word.displayForm} size={16} />
            </p>
            <p className="mt-1 text-sm text-ink">You used it in a sentence — it's truly yours now.</p>
          </Card>
        </motion.div>
      ))}

      {secondCard && (
        <Card hover={false} className="mt-4">
          <p className="text-sm text-ink">{secondCard.label}</p>
        </Card>
      )}

      {summary.nextSessionCount > 0 ? (
        <>
          <Button className="mt-6 w-full justify-center" disabled={startNextPending} onClick={onStartNext}>
            Start next session · {wordsLabel(summary.nextSessionCount)}
          </Button>
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="mt-3 text-sm font-semibold text-muted hover:underline"
          >
            Done
          </button>
        </>
      ) : (
        <>
          <Card hover={false} className="mt-6">
            <p className="flex items-center justify-center gap-2 font-extrabold text-ink">
              <Sprout size={20} /> Nothing's due
            </p>
            <p className="mt-1 text-sm text-muted">Your words are sticking. German grows when you meet new ones.</p>
          </Card>
          <Button className="mt-4 w-full justify-center" onClick={() => navigate('/add')}>
            + Add words
          </Button>
          {summary.practiceCount > 0 && (
            <>
              <button
                type="button"
                onClick={onPracticeMore}
                disabled={practicePending}
                className="mt-3 text-sm font-semibold text-teal hover:underline disabled:opacity-60"
              >
                Practice {wordsLabel(summary.practiceCount)}
              </button>
              <p className="mt-1 text-xs text-muted">Just review — these aren't due yet.</p>
            </>
          )}
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="mt-3 text-sm font-semibold text-muted hover:underline"
          >
            Done
          </button>
        </>
      )}
    </div>
  );
}
