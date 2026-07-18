import { motion } from 'motion/react';
import { Card } from '@/components/ui/Card';
import { tokens } from '@/design/tokens';
import type { Growth } from '@wortgarten/shared';

interface GrowthCardProps {
  growth: Growth;
  index: number;
}

export function GrowthCard({ growth, index }: GrowthCardProps) {
  const max = Math.max(1, ...growth.bars.map((bar) => bar.count));

  return (
    <Card index={index}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold text-ink">Your growth</h3>
        <span className="text-xs text-muted">last {growth.windowDays}d</span>
      </div>

      <div className="flex h-24 items-end gap-1.5">
        {growth.bars.map((bar) => (
          <motion.div
            key={bar.label}
            className="flex-1 rounded-t-md"
            style={{ backgroundColor: tokens.color.teal }}
            initial={{ height: 0 }}
            animate={{ height: `${(bar.count / max) * 100}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            title={`${bar.label}: ${bar.count}`}
          />
        ))}
      </div>

      <p className="mt-3 text-xs text-muted">
        +{growth.totalInWindow} word{growth.totalInWindow === 1 ? '' : 's'} over the last {growth.windowDays} day
        {growth.windowDays === 1 ? '' : 's'}
      </p>
    </Card>
  );
}
