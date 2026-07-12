import { useState } from 'react';
import { Search } from 'lucide-react';
import { displayForm, isIncomplete, pluralDisplayForm } from '@wortgarten/shared';
import type { LexiconSearchResult } from '@wortgarten/shared';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { IncompleteBadge } from '@/components/ui/IncompleteBadge';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { partOfSpeechLabel } from '@/lib/partOfSpeech';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useLexiconSearch } from '../api/useLexiconSearch';
import { useAddWord } from '../api/useAddWord';

function ResultCard({ result, index }: { result: LexiconSearchResult; index: number }) {
  const addWord = useAddWord();
  const { lexeme, senses } = result;
  const plural = pluralDisplayForm(lexeme);

  return (
    <Card index={index}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-deep">{displayForm(lexeme)}</span>
        <Chip variant="lilac">{partOfSpeechLabel[lexeme.partOfSpeech]}</Chip>
        {plural && <span className="text-sm text-muted">{plural}</span>}
        {isIncomplete(lexeme) && <IncompleteBadge />}
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {senses.map((sense) => (
          <div key={sense.id} className="flex items-center justify-between gap-3">
            <span className="text-sm text-deep">{sense.translation}</span>
            {sense.inBank ? (
              <span className="text-xs font-semibold text-success">✓ in your words</span>
            ) : (
              <Button
                variant="outline"
                className="!px-3 !py-1 text-xs"
                onClick={() => addWord.mutate({ senseId: sense.id, sourceType: 'search' })}
              >
                Add
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function SearchTab() {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 300);
  const { data, isLoading } = useLexiconSearch(debounced);

  return (
    <div>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a German or English word…"
          className="pl-10"
        />
      </div>

      {!query.trim() && (
        <div className="mt-8 text-center text-muted">
          <p className="font-semibold text-deep">Collect words you meet in real life</p>
          <p className="mt-1 text-sm">
            Search a word in German or English — pick the meaning you want to keep.
          </p>
        </div>
      )}

      {query.trim() && isLoading && <p className="mt-6 text-center text-sm text-muted">Searching…</p>}

      {query.trim() && !isLoading && data?.results.length === 0 && (
        <p className="mt-6 text-center text-sm text-muted">No matches for "{debounced}".</p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {data?.results.map((result, i) => (
          <ResultCard key={result.lexeme.id} result={result} index={i} />
        ))}
      </div>
    </div>
  );
}
