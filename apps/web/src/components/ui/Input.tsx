import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { tokens } from '@/design/tokens';

const inputStyle = {
  borderRadius: tokens.sketch.radiusB,
  paddingLeft: tokens.component.input.paddingX,
  paddingRight: tokens.component.input.paddingX,
  paddingTop: tokens.component.input.paddingY,
  paddingBottom: tokens.component.input.paddingY,
  fontSize: tokens.font.size.base,
};

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', style, ...props }, ref) {
    return (
      <input
        ref={ref}
        style={{ ...inputStyle, ...style }}
        className={`w-full border-2 border-line bg-surface font-sans font-semibold text-ink placeholder:text-muted focus:outline-none focus:border-teal focus:ring-[3px] focus:ring-teal-soft ${className}`}
        {...props}
      />
    );
  },
);
