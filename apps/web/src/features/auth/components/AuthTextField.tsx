import type { InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui/Input';

interface AuthTextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function AuthTextField({ label, error, id, ...props }: AuthTextFieldProps) {
  const fieldId = id ?? props.name;

  return (
    <label htmlFor={fieldId} className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-deep">{label}</span>
      <Input id={fieldId} {...props} />
      {error && <span className="text-xs font-semibold text-coral">{error}</span>}
    </label>
  );
}
