import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { tokens } from '@/design/tokens';

interface ProgressRingProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  children?: ReactNode;
  color?: string;
}

export function ProgressRing({
  value,
  max,
  size = 88,
  strokeWidth = 8,
  children,
  color = tokens.concept.progress.fill,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useMotionValue(0);
  const dashOffset = useTransform(progress, [0, 1], [circumference, 0]);
  const initialized = useRef(false);

  useEffect(() => {
    const target = value / max;
    if (!initialized.current) {
      initialized.current = true;
      animate(progress, target, { duration: 0.8, ease: 'easeOut' });
    } else {
      animate(progress, target, { duration: 0.8, ease: 'easeOut' });
    }
  }, [value, max, progress]);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tokens.concept.progress.track}
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: dashOffset }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
