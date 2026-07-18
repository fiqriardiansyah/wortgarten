import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { tokens } from '@/design/tokens';

interface SketchBoxProps {
  /** Stable per-element identity the border wobble is derived from — reuse the same seed
   * across re-renders (e.g. React's `useId()`) or two cards will shimmer instead of each
   * having its own fixed hand-drawn shape. */
  seed: string;
  fill?: string | 'none';
  stroke?: string;
  radius?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

// Extra room around the measured box so jittered points never clip against the SVG edge.
const OVERFLOW = 6;

function xmur3(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededRandom(seed: string) {
  return mulberry32(xmur3(seed)());
}

function roundedRectPath(w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M ${rr},0 H ${w - rr} A ${rr},${rr} 0 0 1 ${w},${rr} V ${h - rr} A ${rr},${rr} 0 0 1 ${w - rr},${h} H ${rr} A ${rr},${rr} 0 0 1 0,${h - rr} V ${rr} A ${rr},${rr} 0 0 1 ${rr},0 Z`;
}

function samplePerimeter(w: number, h: number, r: number, samplesPerEdge: number) {
  if (w <= 0 || h <= 0) return [];
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', roundedRectPath(w, h, r));
  const length = path.getTotalLength();
  const total = samplesPerEdge * 4;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < total; i++) {
    const point = path.getPointAtLength((length * i) / total);
    points.push({ x: point.x, y: point.y });
  }
  return points;
}

function jitter(points: { x: number; y: number }[], amount: number, seed: string) {
  const rand = seededRandom(seed);
  return points.map((p) => ({
    x: p.x + (rand() * 2 - 1) * amount,
    y: p.y + (rand() * 2 - 1) * amount,
  }));
}

/** Smooths a closed point loop into a wobbly-but-continuous path via quadratic curves through
 * edge midpoints — the classic freehand-smoothing trick. */
function smoothClosedPath(points: { x: number; y: number }[]) {
  if (points.length < 3) return '';
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const start = mid(points[points.length - 1], points[0]);
  let d = `M ${start.x},${start.y}`;
  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    const m = mid(curr, next);
    d += ` Q ${curr.x},${curr.y} ${m.x},${m.y}`;
  }
  return d + ' Z';
}

/** Tier 2 hand-drawn border: measures its content box, samples a rounded rect perimeter, jitters
 * it twice with a seed-stable RNG, and renders a double-stroke SVG behind crisp text content. */
export function SketchBox({ seed, fill = tokens.color.surface, stroke = tokens.color.ink, radius = tokens.sketch.cornerRadius, className = '', style, children }: SketchBoxProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const paths = useMemo(() => {
    if (!size || size.width <= 0 || size.height <= 0) return null;
    const base = samplePerimeter(size.width, size.height, radius, tokens.sketch.samplesPerEdge);
    const shift = (pts: { x: number; y: number }[]) => pts.map((p) => ({ x: p.x + OVERFLOW, y: p.y + OVERFLOW }));
    const pathA = smoothClosedPath(shift(jitter(base, tokens.sketch.jitterMain, `${seed}:a`)));
    const pathB = smoothClosedPath(shift(jitter(base, tokens.sketch.jitterSecond, `${seed}:b`)));
    return { pathA, pathB };
  }, [size, radius, seed]);

  return (
    <div ref={wrapperRef} className={`relative ${className}`} style={style}>
      {size && paths && (
        <svg
          aria-hidden
          className="pointer-events-none absolute"
          style={{ left: -OVERFLOW, top: -OVERFLOW, width: size.width + OVERFLOW * 2, height: size.height + OVERFLOW * 2, overflow: 'visible' }}
        >
          {fill !== 'none' && <path d={paths.pathA} fill={fill} stroke="none" />}
          <path d={paths.pathA} fill="none" stroke={stroke} strokeWidth={tokens.sketch.strokeMain} strokeLinejoin="round" strokeLinecap="round" />
          <path d={paths.pathB} fill="none" stroke={stroke} strokeWidth={tokens.sketch.strokeSecond} strokeOpacity={tokens.sketch.secondOpacity} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
      <div className="relative">{children}</div>
    </div>
  );
}
