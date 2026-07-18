import { useState } from 'react';
import { SearchTab } from './components/SearchTab';
import { PasteTab } from './components/PasteTab';

type Tab = 'search' | 'paste';

export function AddWordsPage() {
  const [tab, setTab] = useState<Tab>('search');

  return (
    <div>
      <h1 className="text-heading font-bold text-ink">+ Add words</h1>

      <div className="mt-4 inline-flex rounded-pill bg-teal-soft p-1">
        <button
          onClick={() => setTab('search')}
          className={`rounded-pill px-4 py-1.5 text-sm font-semibold transition-colors ${
            tab === 'search' ? 'border-2 border-teal bg-surface text-teal' : 'border-2 border-transparent text-muted'
          }`}
        >
          Search
        </button>
        <button
          onClick={() => setTab('paste')}
          className={`rounded-pill px-4 py-1.5 text-sm font-semibold transition-colors ${
            tab === 'paste' ? 'border-2 border-teal bg-surface text-teal' : 'border-2 border-transparent text-muted'
          }`}
        >
          Paste text
        </button>
      </div>

      <div className="mt-5">{tab === 'search' ? <SearchTab /> : <PasteTab />}</div>
    </div>
  );
}
