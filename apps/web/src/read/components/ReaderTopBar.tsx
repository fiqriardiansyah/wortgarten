import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { tokens } from '@/design/tokens';

export type ReaderFontSize = 'S' | 'M' | 'L';

const FONT_SIZES: ReaderFontSize[] = ['S', 'M', 'L'];

interface ReaderTopBarProps {
  title: string;
  fontSize: ReaderFontSize;
  onFontSizeChange: (size: ReaderFontSize) => void;
  progress: number; // 0-100
}

export function ReaderTopBar({ title, fontSize, onFontSizeChange, progress }: ReaderTopBarProps) {
  const navigate = useNavigate();

  return (
    <div
      className="sticky top-0 z-10 -mx-4 mb-4 px-4 pb-2 pt-1 backdrop-blur lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none"
      style={{ backgroundColor: 'color-mix(in srgb, ' + tokens.color.bg + ' 95%, transparent)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => navigate('/read')}
          aria-label="Back to Read"
          className="flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={16} /> <span className="hidden sm:inline">Back</span>
        </button>

        <h1 className="min-w-0 flex-1 truncate text-center text-sm font-bold text-ink">{title}</h1>

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
      </div>

      <div className="mt-2 h-1 w-full overflow-hidden rounded-pill bg-line">
        <div className="h-full rounded-pill bg-teal transition-[width]" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
