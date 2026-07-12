import type { WordFilter } from '@wortgarten/shared';

const FILTERS: { value: WordFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'needs_attention', label: 'Needs attention' },
  { value: 'learning', label: 'Learning' },
  { value: 'mastered', label: 'Mastered' },
  { value: 'new', label: 'New' },
  { value: 'incomplete', label: 'Incomplete' },
];

interface FilterChipsProps {
  value: WordFilter;
  onChange: (filter: WordFilter) => void;
}

export function FilterChips({ value, onChange }: FilterChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={`rounded-chip px-3 py-1.5 text-sm font-semibold transition-colors ${
            value === f.value ? 'bg-primary text-white' : 'bg-lilac text-primary hover:bg-lilac/70'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
