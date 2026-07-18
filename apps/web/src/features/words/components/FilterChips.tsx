import type { WordFilter } from '@wortgarten/shared';
import { tokens } from '@/design/tokens';

const FILTERS: { value: WordFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'needs_attention', label: 'Needs attention' },
  { value: 'learning', label: 'Learning' },
  { value: 'mastered', label: 'Mastered' },
  { value: 'new', label: 'New' },
  { value: 'incomplete', label: 'Incomplete' },
];

const radii = [tokens.sketch.radiusA, tokens.sketch.radiusB, tokens.sketch.radiusC];

interface FilterChipsProps {
  value: WordFilter;
  onChange: (filter: WordFilter) => void;
}

export function FilterChips({ value, onChange }: FilterChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map((f, i) => {
        const active = value === f.value;
        return (
          <button
            key={f.value}
            onClick={() => onChange(f.value)}
            className="border-2 px-3 py-1.5 text-sm font-semibold transition-colors"
            style={{
              borderRadius: radii[i % radii.length],
              backgroundColor: active ? tokens.color.teal : tokens.color.tealSoft,
              borderColor: active ? tokens.color.teal : 'transparent',
              color: active ? '#FFFFFF' : tokens.color.tealDeep,
            }}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
