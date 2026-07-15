import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { pressSpring, ctaPulseVariants } from '@/design/motion';

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

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:brightness-110',
  light: 'bg-white text-primary hover:brightness-95',
  outline: 'border-2 border-primary text-primary bg-transparent hover:bg-lilac',
  coral: 'bg-coral text-white hover:brightness-110',
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
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={pressSpring}
      animate={pulse && !disabled ? 'pulse' : undefined}
      variants={pulse ? ctaPulseVariants : undefined}
      onClick={disabled ? undefined : onClick}
      onPointerDown={disabled ? undefined : onPointerDown}
      className={`inline-flex items-center gap-2 rounded-pill px-5 py-2.5 font-sans font-700 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
    >
      {children}
      {icon && <span className="ml-1">{icon}</span>}
    </motion.button>
  );
}
