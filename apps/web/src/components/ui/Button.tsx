import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { pressSpring, ctaPulseVariants } from '@/design/motion';

type Variant = 'primary' | 'light' | 'outline' | 'coral';

interface ButtonProps {
  variant?: Variant;
  children: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  pulse?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
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
  icon,
  pulse = false,
  className = '',
  type = 'button',
}: ButtonProps) {
  return (
    <motion.button
      type={type}
      whileTap={{ scale: 0.96 }}
      transition={pressSpring}
      animate={pulse ? 'pulse' : undefined}
      variants={pulse ? ctaPulseVariants : undefined}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-pill px-5 py-2.5 font-sans font-700 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${variantClasses[variant]} ${className}`}
    >
      {children}
      {icon && <span className="ml-1">{icon}</span>}
    </motion.button>
  );
}
