import { useEffect, useState } from 'react';
import { Search, Sprout } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { WordFilter } from '@wortgarten/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useWordsQuery } from './api/useWordsQuery';
import { FilterChips } from './components/FilterChips';
import { WordCard } from './components/WordCard';
import { WordDetails } from './detail/components/WordDetails';

const PAGE_SIZE = 20;

export function WordsPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<WordFilter>('all');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const debounced = useDebouncedValue(query, 300);
  const { data, isLoading } = useWordsQuery({ q: debounced, filter, page, pageSize: PAGE_SIZE });

  function handleFilterChange(next: WordFilter) { setFilter(next); setPage(1); }
  function handleQueryChange(next: string) { setQuery(next); setPage(1); }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isFiltered = query.trim().length > 0 || filter !== 'all';

  useEffect(() => {
    if (items.length && !items.some((word) => word.id === selectedId)) setSelectedId(items[0].id);
    if (!items.length) setSelectedId(null);
  }, [items, selectedId]);

  return (
    <div className=''>
      <div className="flex items-start justify-between gap-8">
        <div><div className="flex items-center gap-2"><h1 className="text-heading font-extrabold text-deep">My Words</h1><Sprout size={21} className="text-primary lg:hidden" /></div><p className="mt-0.5 text-xs text-muted">{total} {total === 1 ? 'word' : 'words'} in your garden</p></div>
        <SearchBox query={query} onChange={handleQueryChange} className="hidden w-72 lg:block" />
      </div>
      <SearchBox query={query} onChange={handleQueryChange} className="mt-3 lg:hidden" />
      <div className="mt-3"><FilterChips value={filter} onChange={handleFilterChange} /></div>

      {isLoading && <p className="mt-8 text-center text-sm text-muted">Loading…</p>}
      {!isLoading && items.length === 0 && !isFiltered && <div className="mt-12 text-center text-muted"><p className="font-semibold text-deep">Your garden is empty — for now</p><p className="mt-1 text-sm">Words you meet in real life will grow here. Start with your first one.</p><Link to="/add"><Button variant="primary" className="mt-4">+ Add words</Button></Link></div>}
      {!isLoading && items.length === 0 && isFiltered && <p className="mt-8 text-center text-sm text-muted">No words match this search or filter.</p>}

      <div className="words-layout mt-4">
        <div className="words-grid">{items.map((word, i) => <WordCard key={word.id} word={word} index={i} selected={selectedId === word.id} onSelect={setSelectedId} />)}</div>
        {selectedId && <div className="words-detail"><WordDetails id={selectedId} sticky onDeleted={() => setSelectedId(null)} /></div>}
      </div>

      {totalPages > 1 && <div className="mt-5 flex items-center justify-center gap-3"><Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Previous</Button><span className="text-sm text-muted">Page {page} of {totalPages}</span><Button variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</Button></div>}
    </div>
  );
}

function SearchBox({ query, onChange, className = '' }: { query: string; onChange: (value: string) => void; className?: string }) {
  return <div className={`relative ${className}`}><Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" /><Input value={query} onChange={(e) => onChange(e.target.value)} placeholder="Search — try ‘dog’ or ‘hund’" className="rounded-pill border-0 pl-10 shadow-none" /></div>;
}
