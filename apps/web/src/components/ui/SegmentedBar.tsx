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
  /** For use on a colored (e.g. primary) card background — swaps the track and label text for
   * readable light variants instead of the default gray-100/muted/deep trio. */
  onDark?: boolean;
}

export function SegmentedBar({ segments, className = '', onDark = false }: SegmentedBarProps) {
  const total = segments.reduce((s, seg) => s + seg.count, 0);

  return (
    <div className={className}>
      <div className={`flex h-3 w-full overflow-hidden rounded-pill ${onDark ? 'bg-white/20' : 'bg-gray-100'}`}>
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
            <span className={`text-xs ${onDark ? 'text-white/80' : 'text-muted'}`}>
              {seg.label} <span className={`font-semibold ${onDark ? 'text-white' : 'text-deep'}`}>{seg.count}</span>
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
