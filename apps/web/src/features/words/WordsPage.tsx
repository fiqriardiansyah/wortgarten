import { Button } from '@/components/ui/Button';
import { IllustrationSlot } from '@/components/ui/IllustrationSlot';
import { Input } from '@/components/ui/Input';
import { tokens } from '@/design/tokens';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import type { WordFilter } from '@wortgarten/shared';
import { Sprout } from 'lucide-react';
import { useEffect, useState } from 'react';
import Measure from 'react-measure';
import Masonry from 'react-responsive-masonry';
import { Link } from 'react-router-dom';
import { useWordsQuery } from './api/useWordsQuery';
import { FilterChips } from './components/FilterChips';
import { WordCard } from './components/WordCard';
import { WordDetails } from './detail/components/WordDetails';

const PAGE_SIZE = 20;
const TWO_COLUMN_MIN_WIDTH = 560;

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
      <div className="flex items-start justify-between gap-8 lg:sticky lg:top-0 lg:z-20 lg:-my-2 lg:py-2" style={{ backgroundColor: tokens.color.bg }}>
        <div><div className="flex items-center gap-2"><h1 className="text-heading font-extrabold text-ink">My Words</h1><Sprout size={21} className="lg:hidden" style={{ color: tokens.color.teal }} /></div><p className="mt-0.5 text-xs text-muted">{total} {total === 1 ? 'word' : 'words'} in your garden</p></div>
        <SearchBox query={query} onChange={handleQueryChange} className="hidden w-72 lg:block" />
      </div>
      <div className="sticky top-0 z-20 -mx-4 px-4 py-3 lg:hidden" style={{ backgroundColor: tokens.color.bg }}>
        <SearchBox query={query} onChange={handleQueryChange} />
      </div>
      <div className="mt-3"><FilterChips value={filter} onChange={handleFilterChange} /></div>

      {isLoading && <p className="mt-8 text-center text-sm text-muted">Loading…</p>}
      {!isLoading && items.length === 0 && !isFiltered && (
        <div className="mt-8 flex flex-col items-center text-center text-muted">
          <IllustrationSlot label="empty word bank" height={140} width={220} />
          <p className="mt-4 font-semibold text-ink">Your garden is empty — for now</p>
          <p className="mt-1 text-sm">Words you meet in real life will grow here. Start with your first one.</p>
          <Link to="/add"><Button variant="primary" className="mt-4">+ Add words</Button></Link>
        </div>
      )}
      {!isLoading && items.length === 0 && isFiltered && <p className="mt-8 text-center text-sm text-muted">No words match this search or filter.</p>}

      <div className="words-layout mt-4">
        <Measure bounds>
          {({ measureRef, contentRect }) => (
            <div ref={measureRef} className="words-grid">
              <Masonry columnsCount={(contentRect.bounds?.width ?? 0) >= TWO_COLUMN_MIN_WIDTH ? 2 : 1} gutter="0.75rem">
                {items.map((word, i) => <WordCard key={word.id} word={word} index={i} selected={selectedId === word.id} onSelect={setSelectedId} />)}
              </Masonry>
            </div>
          )}
        </Measure>
        {selectedId && <div className="words-detail"><WordDetails id={selectedId} sticky onDeleted={() => setSelectedId(null)} /></div>}
      </div>

      {totalPages > 1 && <div className="mt-5 flex items-center justify-center gap-3"><Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Previous</Button><span className="text-sm text-muted">Page {page} of {totalPages}</span><Button variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</Button></div>}
    </div>
  );
}

function SearchBox({ query, onChange, className = '' }: { query: string; onChange: (value: string) => void; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <Input
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search - try ‘dog’ or ‘hund’"
        className="border-0 pl-10 shadow-none"
        style={{ borderRadius: 9999 }}
      />
    </div>
  );
}
