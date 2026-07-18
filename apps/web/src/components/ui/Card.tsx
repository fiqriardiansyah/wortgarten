import { motion } from 'motion/react';
import { useId } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { cardEnterVariants, cardEnterTransition } from '@/design/motion';
import { tokens } from '@/design/tokens';
import { SketchBox } from '@/components/ui/SketchBox';

type Tone = 'default' | 'primary';

interface CardProps {
  children: ReactNode;
  tone?: Tone;
  index?: number;
  className?: string;
  hover?: boolean;
  /** Override the hand-drawn border color, e.g. to show a "selected" state without layering a
   * second plain-CSS border on top of the sketch outline. */
  stroke?: string;
  /** Override the fill color set by `tone`. Use this instead of a `bg-*` className — the SVG
   * border only covers the jittery rounded interior, so a CSS background on the measured div
   * would bleed through square at the corners. */
  fill?: string;
  style?: CSSProperties;
}

const toneFill: Record<Tone, string> = {
  default: tokens.color.surface,
  primary: tokens.color.teal,
};

export function Card({ children, tone = 'default', index = 0, className = '', hover = true, stroke = tokens.color.ink, fill, style }: CardProps) {
  // Stable per-mount id so this card's hand-drawn wobble never re-randomizes on re-render,
  // while still differing from every other Card instance on the page (spec §5).
  const seed = `card-${useId()}`;

  return (
    <motion.div
      variants={cardEnterVariants}
      initial="hidden"
      animate="visible"
      transition={cardEnterTransition(index)}
      style={style}
      whileHover={
        hover
          ? { y: tokens.component.card.hoverLift, transition: { duration: tokens.motion.base / 1000, ease: 'easeOut' } }
          : undefined
      }
    >
      <SketchBox seed={seed} fill={fill ?? toneFill[tone]} stroke={stroke} className={`p-[22px] ${className}`}>
        {children}
      </SketchBox>
    </motion.div>
  );
}
