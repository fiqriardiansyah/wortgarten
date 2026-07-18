import { useState } from 'react';
import type { ReactNode } from 'react';
import type { AnalyzedToken, AnalyzeResponse } from '@wortgarten/shared';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { partOfSpeechLabel } from '@/lib/partOfSpeech';
import { suggestsNonGermanText } from '@/lib/looksGerman';
import { useAnalyzeText } from '../api/useAnalyzeText';
import { useAddWordsBatch } from '../api/useAddWordsBatch';

const MAX_LENGTH = 5000;

interface Selection {
  senseId: string;
  sourceSentence?: string;
}

type SelectionKey = `${number}:${string}`;

function selectionKey(token: AnalyzedToken): SelectionKey | undefined {
  const senseId = token.candidates?.[0]?.senseId;
  return senseId ? `${token.groupId}:${senseId}` : undefined;
}

/** NEW and AMBIGUOUS both default to their top candidate — collectable in one tap,
 * "change meaning" is opt-in rather than a gate. */
function defaultSelection(tokens: AnalyzedToken[]): Map<SelectionKey, Selection> {
  const next = new Map<SelectionKey, Selection>();
  for (const token of tokens) {
    const key = selectionKey(token);
    if ((token.status === 'NEW' || token.status === 'AMBIGUOUS') && token.candidates?.[0] && key && !next.has(key)) {
      next.set(key, { senseId: token.candidates[0].senseId, sourceSentence: token.sourceSentence });
    }
  }
  return next;
}

function TokenSpan({
  token,
  selected,
  active,
  onTap,
}: {
  token: AnalyzedToken;
  selected: boolean;
  active: boolean;
  onTap: () => void;
}) {
  if (token.status === 'KNOWN') {
    return <span className="text-muted">{token.surface}</span>;
  }
  if (token.status === 'UNRECOGNIZED') {
    return <span className="text-muted underline decoration-dotted underline-offset-4">{token.surface}</span>;
  }

  const wordClasses = selected
    ? `bg-teal text-white ${active ? 'ring-2 ring-teal ring-offset-1' : ''}`
    : active
      ? 'border-2 border-teal text-teal bg-transparent'
      : 'border border-dashed border-teal/50 text-teal hover:bg-teal-soft';

  return (
    <span className="inline-flex items-center align-baseline">
      <button
        type="button"
        onClick={onTap}
        className={`rounded-lg px-1.5 py-0.5 font-semibold transition-colors cursor-pointer ${wordClasses}`}
      >
        {token.surface}
      </button>
    </span>
  );
}

function renderTokens(
  text: string,
  tokens: AnalyzedToken[],
  selected: Map<SelectionKey, Selection>,
  activeTokenStart: number | null,
  onTap: (t: AnalyzedToken) => void,
) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  tokens.forEach((token, i) => {
    if (token.start > cursor) nodes.push(<span key={`gap-${i}`}>{text.slice(cursor, token.start)}</span>);
    nodes.push(
      <TokenSpan
        key={`tok-${i}`}
        token={token}
        selected={selectionKey(token) != null && selected.has(selectionKey(token)!)}
        active={token.start === activeTokenStart}
        onTap={() => onTap(token)}
      />,
    );
    cursor = token.end;
  });
  if (cursor < text.length) nodes.push(<span key="tail">{text.slice(cursor)}</span>);
  return nodes;
}

function EmptyState({ hint }: { hint: boolean }) {
  return (
    <div className="mt-3 rounded-sketch border-2 border-line bg-card p-5 text-center">
      <p className="font-semibold text-ink">No German words found.</p>
      <p className="mt-1 text-sm text-muted">
        We didn't recognize any of these. They may be names, typos, or words outside our dictionary.
      </p>
      <p className="mt-1 text-sm text-muted">Try pasting German text — a sentence from a video, an article, or your class.</p>
      {hint && <p className="mt-3 text-xs text-muted">This looks like English — Wortgarten collects German words.</p>}
    </div>
  );
}

export function PasteTab() {
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<Map<SelectionKey, Selection>>(new Map());
  const [activeTokenStart, setActiveTokenStart] = useState<number | null>(null);
  const [draftSenseId, setDraftSenseId] = useState<string | null>(null);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);

  const analyze = useAnalyzeText();
  const addWordsBatch = useAddWordsBatch();

  const analysis: AnalyzeResponse | undefined = analyze.data;
  const tooLong = text.length > MAX_LENGTH;
  const noMatches = analysis != null && analysis.summary.known + analysis.summary.new + analysis.summary.ambiguous === 0;
  const hasAddableTokens = analysis?.tokens.some((t) => t.status === 'NEW' || t.status === 'AMBIGUOUS') ?? false;
  const addableCount = analysis ? analysis.summary.new + analysis.summary.ambiguous : 0;

  function addSelection(token: AnalyzedToken, senseId: string) {
    const key = selectionKey(token);
    if (!key) return;
    setSelected((prev) => {
      const next = new Map(prev);
      next.set(key, { senseId, sourceSentence: token.sourceSentence });
      return next;
    });
  }

  function handleTap(token: AnalyzedToken) {
    if (token.status === 'NEW' || token.status === 'AMBIGUOUS') {
      const key = selectionKey(token);
      setActiveTokenStart(token.start);
      setDraftSenseId((key && selected.get(key)?.senseId) ?? token.candidates?.[0]?.senseId ?? null);
    }
  }

  function handleAnalyze() {
    setAddedMessage(null);
    setActiveTokenStart(null);
    setDraftSenseId(null);
    analyze.mutate(text, {
      onSuccess: () => setSelected(new Map()),
    });
  }

  function handleSelectAllNew() {
    if (analysis) setSelected(defaultSelection(analysis.tokens));
  }

  function handleClearSelection() {
    setSelected(new Map());
  }

  function handleAddSelected() {
    const items = [...selected.values()].map((v) => ({ senseId: v.senseId, sourceSentence: v.sourceSentence }));
    addWordsBatch.mutate(
      { items, sourceType: 'paste' },
      {
        onSuccess: (result) => {
          setAddedMessage(`Added ${result.added.length} word${result.added.length === 1 ? '' : 's'} 🌱`);
          setText('');
          analyze.reset();
          setSelected(new Map());
          setActiveTokenStart(null);
          setDraftSenseId(null);
        },
      },
    );
  }

  const activeToken =
    activeTokenStart == null
      ? undefined
      : analysis?.tokens.find((t) => t.start === activeTokenStart && (t.status === 'NEW' || t.status === 'AMBIGUOUS'));
  const activeKey = activeToken && selectionKey(activeToken);
  const activeSelected = activeKey != null && selected.has(activeKey);

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a German sentence or paragraph you just read…"
        rows={5}
        className="w-full rounded-xl border border-line bg-white px-4 py-3 font-sans text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
      />
      <div className="mt-1 flex items-center justify-between text-xs text-muted">
        <span>{tooLong ? <span className="font-semibold text-coral">Too long — keep it under {MAX_LENGTH} characters.</span> : ''}</span>
        <span>
          {text.length}/{MAX_LENGTH}
        </span>
      </div>

      <Button
        variant="primary"
        className="mt-3 w-full justify-center sm:w-auto"
        onClick={handleAnalyze}
        disabled={!text.trim() || tooLong || analyze.isPending}
      >
        {analyze.isPending ? 'Analyzing…' : 'Analyze'}
      </Button>

      {addedMessage && <p className="mt-4 text-sm font-semibold text-teal">{addedMessage}</p>}

      {analysis && noMatches && <EmptyState hint={suggestsNonGermanText(analysis.text)} />}

      {analysis && !noMatches && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Chip variant="neutral">
              {analysis.summary.total} word{analysis.summary.total === 1 ? '' : 's'}
            </Chip>
            {analysis.summary.known > 0 && <Chip variant="lilac">{analysis.summary.known} you already know</Chip>}
            {addableCount > 0 && <Chip variant="coral">{addableCount} new</Chip>}
          </div>
          {analysis.summary.unrecognized > 0 && (
            <p className="mt-1 text-xs text-muted">
              {analysis.summary.unrecognized} word{analysis.summary.unrecognized === 1 ? '' : 's'} not recognized
            </p>
          )}

          <div className="mt-3 rounded-sketch border-2 border-line bg-card p-4">
            {hasAddableTokens && <p className="text-sm text-muted">Tap a highlighted word to see its meaning and add it</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2 whitespace-pre-wrap leading-8">
              {renderTokens(analysis.text, analysis.tokens, selected, activeTokenStart, handleTap)}
            </div>

            {activeToken?.candidates && activeToken.candidates.length > 0 && (
              <div className="mt-4 rounded-xl border border-line p-4">
                <p className="font-bold text-ink">Choose the meaning of “{activeToken.surface}”</p>
                <div className="mt-3 flex flex-col gap-2">
                  {activeToken.candidates.map((candidate) => (
                    <button
                      key={candidate.senseId}
                      type="button"
                      onClick={() => setDraftSenseId(candidate.senseId)}
                      className={`flex items-center justify-between gap-4 rounded-xl border px-3 py-2 text-left transition-colors ${
                        draftSenseId === candidate.senseId
                          ? 'border-teal bg-teal-soft'
                          : 'border-line hover:border-teal/40 hover:bg-teal-soft/40'
                      }`}
                    >
                      <span>
                        <span className="block font-semibold text-ink">{candidate.lexeme.lemma}</span>
                        <span className="block text-sm text-muted">
                          {candidate.translation} · {partOfSpeechLabel[candidate.lexeme.partOfSpeech]}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                          draftSenseId === candidate.senseId ? 'border-teal bg-teal ring-2 ring-white ring-inset' : 'border-line'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="primary"
                    className="!px-5 !py-2 text-sm"
                    disabled={!draftSenseId || (activeSelected && selected.get(activeKey!)?.senseId === draftSenseId)}
                    onClick={() => draftSenseId && addSelection(activeToken, draftSenseId)}
                  >
                    {activeSelected && selected.get(activeKey!)?.senseId === draftSenseId ? 'Added ✓' : 'Add word'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {hasAddableTokens && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="order-2 grid grid-cols-2 gap-2 sm:order-1 sm:flex">
            <Button
              variant="outline"
              className="w-full justify-center !px-3 !py-2 text-xs sm:w-auto sm:!py-1.5"
              onClick={handleSelectAllNew}
            >
              Select all new
            </Button>
            <Button
              variant="outline"
              className="w-full justify-center !px-3 !py-2 text-xs sm:w-auto sm:!py-1.5"
              onClick={handleClearSelection}
            >
              Clear
            </Button>
          </div>
          <div className="order-1 text-center sm:order-2 sm:text-right">
            <Button
              variant="primary"
              className="w-full justify-center sm:w-auto"
              onClick={handleAddSelected}
              disabled={selected.size === 0}
              pulse={selected.size > 0}
            >
              {addWordsBatch.isPending
                ? 'Adding…'
                : selected.size === 0
                  ? 'Select words to add'
                  : `Add ${selected.size} word${selected.size === 1 ? '' : 's'}`}
            </Button>
            <p className="mt-1 text-xs text-muted">
              {selected.size} of {addableCount} new word{addableCount === 1 ? '' : 's'} selected
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
