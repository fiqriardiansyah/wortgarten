import { tokens } from '@/design/tokens';

interface StatNumberProps {
  value: number | string;
  caption: string;
  color?: 'primary' | 'gold' | 'deep';
  className?: string;
}

// 'primary' and 'gold' both read as teal in the sketch theme — teal is the "achieved/positive
// stat" color, and yellow is reserved for progress-in-motion, never a resting number (§2.3).
const colorValues: Record<'primary' | 'gold' | 'deep', string> = {
  primary: tokens.color.teal,
  gold: tokens.color.teal,
  deep: tokens.color.ink,
};

export function StatNumber({ value, caption, color = 'deep', className = '' }: StatNumberProps) {
  return (
    <div className={`flex flex-col ${className}`}>
      <span
        className="font-sans leading-none"
        style={{
          color: colorValues[color],
          fontSize: tokens.font.size.num.max,
          fontWeight: tokens.font.weight.bold,
          letterSpacing: '-1%',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
      <span className="mt-1" style={{ color: tokens.color.muted, fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semi }}>
        {caption}
      </span>
    </div>
  );
}
