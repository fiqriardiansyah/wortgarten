import type { ReactNode } from 'react';
import { Sprout } from 'lucide-react';
import { Card } from '@/components/ui/Card';

const SPARKLES = [
  { top: '10%', left: '10%', size: 14, opacity: 0.25 },
  { top: '20%', left: '85%', size: 10, opacity: 0.2 },
  { top: '75%', left: '90%', size: 16, opacity: 0.18 },
  { top: '85%', left: '8%', size: 12, opacity: 0.22 },
];

function Sparkle({ top, left, size, opacity }: { top: string; left: string; size: number; opacity: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute select-none text-primary"
      style={{ top, left, fontSize: size, opacity }}
    >
      ✦
    </span>
  );
}

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-page px-4 py-12 font-sans">
      {SPARKLES.map((s, i) => (
        <Sparkle key={i} {...s} />
      ))}

      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Sprout size={26} className="text-primary" />
          <span className="text-lg font-extrabold text-deep">Wortgarten</span>
        </div>

        <Card className="w-full">
          <div className="mb-5 text-center">
            <h1 className="text-heading-sm font-bold text-deep">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>

          {children}
        </Card>

        {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
      </div>
    </div>
  );
}
