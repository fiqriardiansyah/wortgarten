import type { CSSProperties, ReactNode } from 'react';
import { tokens } from '@/design/tokens';

type ChipVariant = 'neutral' | 'lilac' | 'level' | 'new' | 'learning' | 'mastered' | 'coral' | 'success' | 'accent';

interface ChipProps {
  variant?: ChipVariant;
  children: ReactNode;
  className?: string;
  /** Tier 1 radius hack has 3 shape variants — pass a different one per sibling so a row of
   * chips isn't one repeated shape (spec §5). Defaults to the same shape everywhere, which is
   * fine for the common case of one standalone chip. */
  radiusVariant?: 'A' | 'B' | 'C';
  /** Escape hatch for callers that need to override fill/text on a specific background (e.g. a
   * chip sitting on a solid teal Card). Wins over the variant's own colors — a `className` color
   * override would NOT win here since these are applied inline. */
  style?: CSSProperties;
}

const variantColors: Record<ChipVariant, { fill: string; text: string; border: string }> = {
  neutral: { fill: tokens.color.lineSoft, text: tokens.color.inkSoft, border: tokens.color.line },
  lilac: { fill: tokens.color.tealSoft, text: tokens.color.tealDeep, border: tokens.color.teal },
  level: { fill: tokens.color.tealSoft, text: tokens.color.tealDeep, border: tokens.color.teal },
  new: { fill: tokens.color.surface, text: tokens.color.muted, border: tokens.color.line },
  learning: { fill: tokens.color.tealSoft, text: tokens.color.tealDeep, border: tokens.color.teal },
  mastered: { fill: tokens.color.teal, text: '#FFFFFF', border: tokens.color.teal },
  coral: { fill: tokens.color.coralSoft, text: tokens.color.coralDeep, border: tokens.color.coral },
  success: { fill: tokens.color.tealSoft, text: tokens.color.teal, border: tokens.color.teal },
  accent: { fill: tokens.color.yellowSoft, text: tokens.color.yellowDeep, border: tokens.color.yellow },
};

const radii = { A: tokens.sketch.radiusA, B: tokens.sketch.radiusB, C: tokens.sketch.radiusC };

export function Chip({ variant = 'neutral', children, className = '', radiusVariant = 'A', style }: ChipProps) {
  const { fill, text, border } = variantColors[variant];
  return (
    <span
      style={{
        backgroundColor: fill,
        color: text,
        borderColor: border,
        borderRadius: radii[radiusVariant],
        paddingLeft: tokens.component.chip.paddingX,
        paddingRight: tokens.component.chip.paddingX,
        paddingTop: tokens.component.chip.paddingY,
        paddingBottom: tokens.component.chip.paddingY,
        fontSize: tokens.font.size.xs,
        fontWeight: tokens.font.weight.bold,
        ...style,
      }}
      className={`inline-flex items-center border-2 leading-none ${className}`}
    >
      {children}
    </span>
  );
}
