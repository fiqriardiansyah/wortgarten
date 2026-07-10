import { motion } from 'motion/react';
import { tokens } from '@/design/tokens';

interface Segment {
  label: string;
  count: number;
  color: string;
}

interface SegmentedBarProps {
  segments: Segment[];
  className?: string;
}

export function SegmentedBar({ segments, className = '' }: SegmentedBarProps) {
  const total = segments.reduce((s, seg) => s + seg.count, 0);

  return (
    <div className={className}>
      <div className="flex h-3 w-full overflow-hidden rounded-pill bg-gray-100">
        {segments.map((seg, i) => {
          const pct = total > 0 ? (seg.count / total) * 100 : 0;
          return (
            <motion.div
              key={seg.label}
              style={{ backgroundColor: seg.color }}
              className={i === 0 ? 'rounded-l-pill' : i === segments.length - 1 ? 'rounded-r-pill' : ''}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: i * 0.1 }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex gap-4">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
            <span className="text-xs text-muted">
              {seg.label} <span className="font-semibold text-deep">{seg.count}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const segmentColors = {
  new: tokens.colors.muted,
  learning: tokens.colors.primary,
  mastered: tokens.colors.gold,
};
