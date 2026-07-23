import type { ReaderFontSize } from './ReaderTopBar';

const FONT_SIZES: ReaderFontSize[] = ['S', 'M', 'L'];

interface FontSizeSelectorProps {
  fontSize: ReaderFontSize;
  onFontSizeChange: (size: ReaderFontSize) => void;
}

export function FontSizeSelector({ fontSize, onFontSizeChange }: FontSizeSelectorProps) {
  return (
    <div className="flex flex-shrink-0 items-center gap-0.5 rounded-pill border-2 border-line bg-surface px-1 py-1">
      {FONT_SIZES.map((size) => (
        <button
          key={size}
          onClick={() => onFontSizeChange(size)}
          aria-label={`Font size ${size}`}
          aria-pressed={fontSize === size}
          className={`rounded-pill px-2 py-0.5 font-bold transition-colors ${
            fontSize === size ? 'bg-teal text-white' : 'text-muted hover:text-ink'
          } ${size === 'S' ? 'text-xs' : size === 'M' ? 'text-sm' : 'text-base'}`}
        >
          Aa
        </button>
      ))}
    </div>
  );
}
