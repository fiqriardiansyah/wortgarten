import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { pressSpring, ctaPulseVariants } from '@/design/motion';
import { tokens } from '@/design/tokens';

type Variant = 'primary' | 'light' | 'outline' | 'coral';

interface ButtonProps {
  variant?: Variant;
  children: ReactNode;
  onClick?: () => void;
  /** Fires on pointerdown instead of click-complete — pairs with the press-scale spring below to
   * hide network latency inside motion that's already rendering (design spec, Part 9). */
  onPointerDown?: () => void;
  icon?: ReactNode;
  pulse?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}

// Primary/destructive are Tier 1 "solid or bordered" per spec §7. `outline` is the signature
// dashed secondary button; `light` is an unspec'd but necessary fourth case — a button that
// reads on top of a solid teal Card (spec's `tone="primary"` hero cards).
const variantClasses: Record<Variant, string> = {
  primary: 'bg-teal text-white border-transparent hover:brightness-[1.06]',
  light: 'bg-surface text-teal border-transparent hover:brightness-95',
  outline: 'bg-transparent text-muted border-line border-dashed hover:text-teal hover:border-teal',
  coral: 'bg-transparent text-coral border-coral hover:bg-coral-soft',
};

const buttonStyle = {
  borderRadius: tokens.sketch.radiusA,
  height: tokens.component.button.height,
  paddingLeft: tokens.component.button.paddingX,
  paddingRight: tokens.component.button.paddingX,
  paddingTop: tokens.component.button.paddingY,
  paddingBottom: tokens.component.button.paddingY,
  gap: tokens.component.button.iconGap,
};

export function Button({
  variant = 'primary',
  children,
  onClick,
  onPointerDown,
  icon,
  pulse = false,
  className = '',
  type = 'button',
  disabled = false,
}: ButtonProps) {
  return (
    <motion.button
      type={type}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: tokens.component.button.pressScale }}
      transition={pressSpring}
      animate={pulse && !disabled ? 'pulse' : undefined}
      variants={pulse ? ctaPulseVariants : undefined}
      onClick={disabled ? undefined : onClick}
      onPointerDown={disabled ? undefined : onPointerDown}
      style={buttonStyle}
      className={`inline-flex items-center justify-center border-2 font-sans text-[15px] font-bold leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${variantClasses[variant]} ${className}`}
    >
      {children}
      {icon && <span className="ml-1">{icon}</span>}
    </motion.button>
  );
}
