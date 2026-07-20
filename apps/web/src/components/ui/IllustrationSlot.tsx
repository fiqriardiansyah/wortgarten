import { useId, useState } from 'react';
import { tokens } from '@/design/tokens';
import { SketchBox } from '@/components/ui/SketchBox';

interface IllustrationSlotProps {
  /** What belongs here, e.g. "empty word bank" — shown as a dev-mode placeholder label until
   * real line art (spec §9) is dropped in. Ignored when `imageUrl` is set. */
  label: string;
  width?: number | string;
  height: number;
  className?: string;
  /** Real generated art (e.g. a story cover), when there is one. `null`/`undefined` keeps the
   * placeholder — a missing image is a deliberate design variant, never a broken-image state. */
  imageUrl?: string | null;
  imageAlt?: string;
}

/** Reserves a fixed-size slot for an illustration so layout never collapses to zero height while
 * art is missing (spec §9 acceptance check: "Every screen has ≥1 illustration slot, and slots
 * reserve their space"). Renders real art inset within the same hand-drawn border when `imageUrl`
 * is provided — inset rather than edge-to-edge, since `SketchBox`'s children sit in a plain
 * rectangular box and a flush image would bleed its square corners past the jittery rounded fill. */
export function IllustrationSlot({ label, width = '100%', height, className = '', imageUrl, imageAlt }: IllustrationSlotProps) {
  const seed = `illustration-${useId()}`;
  const [loaded, setLoaded] = useState(false);

  if (imageUrl) {
    return (
      <SketchBox
        seed={seed}
        fill={tokens.color.surfaceAlt}
        stroke={tokens.color.line}
        className={`p-1.5 ${className}`}
        style={{ width, height }}
      >
        <div className="relative h-full w-full overflow-hidden" style={{ borderRadius: tokens.sketch.cornerRadius - 6 }}>
          {!loaded && <div className="absolute inset-0 animate-pulse" style={{ backgroundColor: tokens.color.lineSoft }} />}
          <img
            src={imageUrl}
            alt={imageAlt ?? label}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          />
        </div>
      </SketchBox>
    );
  }

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
