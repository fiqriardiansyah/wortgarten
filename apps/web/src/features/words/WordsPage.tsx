import { useState } from 'react';
import { Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { WordFilter } from '@wortgarten/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useWordsQuery } from './api/useWordsQuery';
import { FilterChips } from './components/FilterChips';
import { WordCard } from './components/WordCard';

const PAGE_SIZE = 20;

export function WordsPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<WordFilter>('all');
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(query, 300);

  const { data, isLoading } = useWordsQuery({ q: debounced, filter, page, pageSize: PAGE_SIZE });

  function handleFilterChange(next: WordFilter) {
    setFilter(next);
    setPage(1);
  }

  function handleQueryChange(next: string) {
    setQuery(next);
    setPage(1);
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isFiltered = query.trim().length > 0 || filter !== 'all';

  return (
    <div>
      <h1 className="text-heading font-bold text-deep">Your words</h1>

      <div className="relative mt-4">
        <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <Input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search your words…"
          className="pl-10"
        />
      </div>

      <div className="mt-3">
        <FilterChips value={filter} onChange={handleFilterChange} />
      </div>

      {isLoading && <p className="mt-8 text-center text-sm text-muted">Loading…</p>}

      {!isLoading && items.length === 0 && !isFiltered && (
        <div className="mt-12 text-center text-muted">
          <p className="font-semibold text-deep">Your garden is empty — for now</p>
          <p className="mt-1 text-sm">Words you meet in real life will grow here. Start with your first one.</p>
          <Link to="/add">
            <Button variant="primary" className="mt-4">
              + Add words
            </Button>
          </Link>
        </div>
      )}

      {!isLoading && items.length === 0 && isFiltered && (
        <p className="mt-8 text-center text-sm text-muted">No words match this search or filter.</p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {items.map((word, i) => (
          <WordCard key={word.id} word={word} index={i} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            Previous
          </Button>
          <span className="text-sm text-muted">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
