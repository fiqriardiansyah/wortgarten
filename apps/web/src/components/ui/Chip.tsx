import type { ReactNode } from 'react';

type ChipVariant = 'neutral' | 'lilac' | 'level' | 'new' | 'learning' | 'mastered' | 'coral';

interface ChipProps {
  variant?: ChipVariant;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<ChipVariant, string> = {
  neutral: 'bg-gray-100 text-deep',
  lilac: 'bg-lilac text-primary',
  level: 'bg-primary/10 text-primary',
  new: 'bg-gray-100 text-muted',
  learning: 'bg-lilac text-primary',
  mastered: 'bg-gold/10 text-gold',
  coral: 'bg-coral/10 text-coral',
};

export function Chip({ variant = 'neutral', children, className = '' }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center rounded-chip px-2.5 py-0.5 text-xs font-semibold ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
