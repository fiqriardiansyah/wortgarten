import { motion } from 'motion/react';

interface LinearProgressProps {
  value: number;
  max: number;
  color?: string;
  className?: string;
}

export function LinearProgress({ value, max, color = '#3DDC97', className = '' }: LinearProgressProps) {
  const pct = Math.min((value / max) * 100, 100);

  return (
    <div className={`h-2.5 w-full overflow-hidden rounded-pill bg-gray-100 ${className}`}>
      <motion.div
        className="h-full rounded-pill"
        style={{ backgroundColor: color }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </div>
  );
}
