import type { ReactNode } from 'react';
import { Sprout } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { tokens } from '@/design/tokens';

// 6-8 small dots per screen, not 30 (spec §7 "Confetti dots").
const CONFETTI = [
  { top: '10%', left: '10%', size: 6, color: tokens.color.teal },
  { top: '20%', left: '85%', size: 5, color: tokens.color.yellow },
  { top: '75%', left: '90%', size: 7, color: tokens.color.coral },
  { top: '85%', left: '8%', size: 5, color: tokens.color.teal },
  { top: '45%', left: '50%', size: 4, color: tokens.color.yellow },
  { top: '60%', left: '20%', size: 6, color: tokens.color.coral },
];

function ConfettiDot({ top, left, size, color }: { top: string; left: string; size: number; color: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute select-none rounded-full"
      style={{ top, left, width: size, height: size, backgroundColor: color, opacity: tokens.concept.confetti.opacity }}
    />
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
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12 font-sans" style={{ backgroundColor: tokens.color.bg }}>
      {CONFETTI.map((c, i) => (
        <ConfettiDot key={i} {...c} />
      ))}

      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Sprout size={26} style={{ color: tokens.color.teal }} />
          <span className="text-lg font-extrabold" style={{ color: tokens.color.ink }}>
            Wortgarten
          </span>
        </div>

        <Card className="w-full">
          <div className="mb-5 text-center">
            <h1 className="text-heading-sm font-bold" style={{ color: tokens.color.ink }}>
              {title}
            </h1>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>

          {children}
        </Card>

        {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
      </div>
    </div>
  );
}
