import { useState } from 'react';
import type { ReactNode } from 'react';
import type { AnalyzedToken, AnalyzeResponse } from '@wortgarten/shared';
import { Button } from '@/components/ui/Button';
import { suggestsNonGermanText } from '@/lib/looksGerman';
import { useAnalyzeText } from '../api/useAnalyzeText';
import { useAddWordsBatch } from '../api/useAddWordsBatch';
import { SensePickerModal } from './SensePickerModal';

const MAX_LENGTH = 5000;

interface Selection {
  senseId: string;
  sourceSentence?: string;
}

/** NEW and AMBIGUOUS both default to their top candidate — collectable in one tap,
 * "change meaning" is opt-in rather than a gate. */
function defaultSelection(tokens: AnalyzedToken[]): Map<number, Selection> {
  const next = new Map<number, Selection>();
  for (const token of tokens) {
    if ((token.status === 'NEW' || token.status === 'AMBIGUOUS') && token.candidates?.[0] && !next.has(token.groupId)) {
      next.set(token.groupId, { senseId: token.candidates[0].senseId, sourceSentence: token.sourceSentence });
    }
  }
  return next;
}

function TokenSpan({
  token,
  selection,
  onTap,
  onOpenPicker,
}: {
  token: AnalyzedToken;
  selection?: Selection;
  onTap: () => void;
  onOpenPicker: () => void;
}) {
  if (token.status === 'KNOWN') {
    return <span className="text-muted">{token.surface}</span>;
  }
  if (token.status === 'UNRECOGNIZED') {
    return <span className="text-muted underline decoration-dotted underline-offset-4">{token.surface}</span>;
  }

  const selected = selection != null;
  const wordClasses = selected
    ? 'bg-primary text-white'
    : 'bg-lilac text-primary hover:bg-lilac/70';
  const chosen = selection && token.candidates?.find((c) => c.senseId === selection.senseId);

  return (
    <span className="inline-flex items-center gap-0.5 align-baseline">
      <button
        type="button"
        onClick={onTap}
        className={`rounded px-0.5 font-semibold transition-colors cursor-pointer ${wordClasses}`}
      >
        {token.surface}
      </button>
      {token.status === 'AMBIGUOUS' && (
        <button
          type="button"
          onClick={onOpenPicker}
          aria-label={`Change meaning of "${token.surface}"`}
          className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold leading-none text-primary hover:bg-primary/25"
        >
          ?
        </button>
      )}
      {chosen && (
        <span className="rounded-chip bg-white/70 px-1.5 py-0.5 text-xs font-normal text-muted">
          {chosen.lexeme.lemma} · {chosen.translation}
        </span>
      )}
    </span>
  );
}

function renderTokens(
  text: string,
  tokens: AnalyzedToken[],
  selected: Map<number, Selection>,
  onTap: (t: AnalyzedToken) => void,
  onOpenPicker: (t: AnalyzedToken) => void,
) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  tokens.forEach((token, i) => {
    if (token.start > cursor) nodes.push(<span key={`gap-${i}`}>{text.slice(cursor, token.start)}</span>);
    nodes.push(
      <TokenSpan
        key={`tok-${i}`}
        token={token}
        selection={selected.get(token.groupId)}
        onTap={() => onTap(token)}
        onOpenPicker={() => onOpenPicker(token)}
      />,
    );
    cursor = token.end;
  });
  if (cursor < text.length) nodes.push(<span key="tail">{text.slice(cursor)}</span>);
  return nodes;
}

function EmptyState({ hint }: { hint: boolean }) {
  return (
    <div className="mt-3 rounded-card bg-card p-5 text-center shadow-card">
      <p className="font-semibold text-deep">No German words found.</p>
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
  const [selected, setSelected] = useState<Map<number, Selection>>(new Map());
  const [pickerGroupId, setPickerGroupId] = useState<number | null>(null);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);

  const analyze = useAnalyzeText();
  const addWordsBatch = useAddWordsBatch();

  const analysis: AnalyzeResponse | undefined = analyze.data;
  const tooLong = text.length > MAX_LENGTH;
  const noMatches = analysis != null && analysis.summary.known + analysis.summary.new + analysis.summary.ambiguous === 0;
  const hasAddableTokens = analysis?.tokens.some((t) => t.status === 'NEW' || t.status === 'AMBIGUOUS') ?? false;

  function toggleSelection(token: AnalyzedToken) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(token.groupId)) {
        next.delete(token.groupId);
      } else if (token.candidates?.[0]) {
        next.set(token.groupId, { senseId: token.candidates[0].senseId, sourceSentence: token.sourceSentence });
      }
      return next;
    });
  }

  function handleTap(token: AnalyzedToken) {
    if (token.status === 'NEW' || token.status === 'AMBIGUOUS') toggleSelection(token);
  }

  function chooseSense(senseId: string) {
    if (pickerGroupId == null) return;
    const token = analysis?.tokens.find((t) => t.groupId === pickerGroupId);
    setSelected((prev) => new Map(prev).set(pickerGroupId, { senseId, sourceSentence: token?.sourceSentence }));
    setPickerGroupId(null);
  }

  function clearPickerGroup() {
    if (pickerGroupId == null) return;
    setSelected((prev) => {
      const next = new Map(prev);
      next.delete(pickerGroupId);
      return next;
    });
    setPickerGroupId(null);
  }

  function handleAnalyze() {
    setAddedMessage(null);
    analyze.mutate(text, {
      onSuccess: (result) => setSelected(defaultSelection(result.tokens)),
    });
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
        },
      },
    );
  }

  const pickerToken = pickerGroupId == null ? undefined : analysis?.tokens.find((t) => t.groupId === pickerGroupId);

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a German sentence or paragraph you just read…"
        rows={5}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-sans text-sm text-deep placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
      />
      <div className="mt-1 flex items-center justify-between text-xs text-muted">
        <span>{tooLong ? <span className="font-semibold text-coral">Too long — keep it under {MAX_LENGTH} characters.</span> : ''}</span>
        <span>
          {text.length}/{MAX_LENGTH}
        </span>
      </div>

      <Button
        variant="primary"
        className="mt-3"
        onClick={handleAnalyze}
        disabled={!text.trim() || tooLong || analyze.isPending}
      >
        {analyze.isPending ? 'Analyzing…' : 'Analyze'}
      </Button>

      {addedMessage && <p className="mt-4 text-sm font-semibold text-success">{addedMessage}</p>}

      {analysis && noMatches && <EmptyState hint={suggestsNonGermanText(analysis.text)} />}

      {analysis && !noMatches && (
        <div className="mt-3 rounded-card bg-card p-4 shadow-card">
          <p className="border-b border-gray-100 pb-3 text-sm text-muted">
            {analysis.summary.total} words · {analysis.summary.known} you know ·{' '}
            <span className="font-bold text-primary">{analysis.summary.new} new</span>
            {analysis.summary.ambiguous > 0 ? ` · ${analysis.summary.ambiguous} to clarify` : ''} ·{' '}
            {analysis.summary.unrecognized} not recognized
          </p>
          <div className="mt-3 whitespace-pre-wrap leading-8">
            {renderTokens(analysis.text, analysis.tokens, selected, handleTap, (t) => setPickerGroupId(t.groupId))}
          </div>
        </div>
      )}

      {pickerToken?.candidates && (
        <SensePickerModal
          surface={pickerToken.surface}
          candidates={pickerToken.candidates}
          selectedSenseId={selected.get(pickerToken.groupId)?.senseId}
          onChoose={chooseSense}
          onClear={clearPickerGroup}
          onClose={() => setPickerGroupId(null)}
        />
      )}

      {hasAddableTokens && (
        <div className="mt-3 flex justify-end">
          <Button variant="primary" onClick={handleAddSelected} disabled={selected.size === 0} pulse={selected.size > 0}>
            {addWordsBatch.isPending ? 'Adding…' : `Add ${selected.size} word${selected.size === 1 ? '' : 's'}`}
          </Button>
        </div>
      )}
    </div>
  );
}
