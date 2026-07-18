import { useId } from 'react';
import { tokens } from '@/design/tokens';
import { SketchBox } from '@/components/ui/SketchBox';

interface IllustrationSlotProps {
  /** What belongs here, e.g. "empty word bank" — shown as a dev-mode placeholder label until
   * real line art (spec §9) is dropped in. */
  label: string;
  width?: number | string;
  height: number;
  className?: string;
}

/** Reserves a fixed-size slot for a future illustration so layout never collapses to zero height
 * while art is missing (spec §9 acceptance check: "Every screen has ≥1 illustration slot, and
 * slots reserve their space"). */
export function IllustrationSlot({ label, width = '100%', height, className = '' }: IllustrationSlotProps) {
  const seed = `illustration-${useId()}`;

  return (
    <SketchBox
      seed={seed}
      fill={tokens.color.surfaceAlt}
      stroke={tokens.color.line}
      className={`flex items-center justify-center ${className}`}
      style={{ width, height }}
    >
      <span
        className="px-4 text-center"
        style={{ color: tokens.color.muted, fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semi }}
      >
        {label}
      </span>
    </SketchBox>
  );
}
