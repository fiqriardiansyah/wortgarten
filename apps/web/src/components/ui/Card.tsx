import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cardEnterVariants, cardEnterTransition } from '@/design/motion';

type Tone = 'default' | 'primary';

interface CardProps {
  children: ReactNode;
  tone?: Tone;
  index?: number;
  className?: string;
  hover?: boolean;
}

const toneClasses: Record<Tone, string> = {
  default: 'bg-card shadow-card',
  primary: 'bg-primary shadow-card',
};

export function Card({ children, tone = 'default', index = 0, className = '', hover = true }: CardProps) {
  return (
    <motion.div
      variants={cardEnterVariants}
      initial="hidden"
      animate="visible"
      transition={cardEnterTransition(index)}
      whileHover={hover ? { y: -2, boxShadow: '0 12px 32px rgba(108,92,231,0.15)' } : undefined}
      className={`rounded-card p-5 ${toneClasses[tone]} ${className}`}
    >
      {children}
    </motion.div>
  );
}
