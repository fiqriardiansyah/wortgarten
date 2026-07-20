import { useState } from 'react';
import { tokens } from '@/design/tokens';

interface StoryCoverBannerProps {
  src: string;
  alt: string;
  height?: number;
  className?: string;
}

/** A short full-width banner strip for a story cover inside an already-padded container (e.g.
 * `Card`) — never edge-to-edge/full-bleed, since the card's own padding is what keeps this
 * rounded rectangle's corners clear of the card's hand-drawn border. `object-cover` on a
 * short/wide strip crops only the image's vertical margins, never its horizontally-centered
 * subject (the cover prompt itself renders the subject small with generous side padding). */
export function StoryCoverBanner({ src, alt, height = 90, className = '' }: StoryCoverBannerProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={`relative overflow-hidden h-full flex-1 rounded-xl ${className}`} style={{ height }}>
      {!loaded && <div className="absolute inset-0 animate-pulse" style={{ backgroundColor: tokens.color.surfaceAlt }} />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
