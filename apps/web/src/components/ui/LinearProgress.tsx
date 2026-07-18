import { motion } from 'motion/react';
import { tokens } from '@/design/tokens';
import { progressFillTransition } from '@/design/motion';

interface LinearProgressProps {
  value: number;
  max: number;
  color?: string;
  className?: string;
}

export function LinearProgress({ value, max, color = tokens.concept.progress.fill, className = '' }: LinearProgressProps) {
  const pct = Math.min((value / max) * 100, 100);

  return (
    <div
      className={`w-full overflow-hidden rounded-pill ${className}`}
      style={{ height: tokens.component.progressBar.height, backgroundColor: tokens.concept.progress.track }}
    >
      <motion.div
        className="h-full rounded-pill"
        style={{ backgroundColor: color }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={progressFillTransition}
      />
    </div>
  );
}
