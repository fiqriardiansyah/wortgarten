import { useState } from 'react';
import { Send } from 'lucide-react';
import type { ReplyMode, ReplyScaffold } from '@wortgarten/shared';
import { tokens } from '@/design/tokens';

export interface ReplySlotProps {
  mode: ReplyMode;
  /** Every mode ends by producing plain text — the thread and the turn endpoint depend on
   * nothing else. Adding "speak" later is a new renderer behind this same prop, touching no
   * other file. */
  onSubmit: (text: string) => void;
  /** Ignored by "type" unless it carries rustyWords. Feeds "tiles" (word bank to assemble from)
   * / "choice" (options to pick from) — see the iteration 2 spec's reply director. */
  scaffold?: ReplyScaffold;
  disabled?: boolean;
}

const chipButtonClass =
  'rounded-pill border-2 border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-teal hover:bg-teal-soft active:scale-95 disabled:opacity-50';

function TypeInsteadLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="self-start text-xs font-semibold text-muted hover:text-teal hover:underline">
      Type instead
    </button>
  );
}

function TypeReply({
  onSubmit,
  disabled,
  rustyWords,
}: {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  rustyWords?: ReplyScaffold['rustyWords'];
}) {
  const [value, setValue] = useState('');

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    onSubmit(text);
    setValue('');
  }

  function insertWord(word: string) {
    setValue((v) => (v.length === 0 || v.endsWith(' ') ? v + word : `${v} ${word}`));
  }

  return (
    <div className="flex flex-col gap-1.5">
      {rustyWords && rustyWords.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-xs text-muted">Try using:</span>
          {rustyWords.map((hint) => (
            <button
              key={hint.lexemeId}
              type="button"
              disabled={disabled}
              onClick={() => insertWord(hint.display)}
              className="rounded-pill border-2 border-line bg-surface px-2.5 py-1 text-xs font-semibold transition-colors hover:border-teal hover:bg-teal-soft disabled:opacity-50"
              style={{ color: tokens.color.tealDeep }}
            >
              {hint.display}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          disabled={disabled}
          placeholder="Type in German…"
          className="flex-1 rounded-pill border-2 border-line bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-teal disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || value.trim().length === 0}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-transform active:scale-95 disabled:opacity-40"
          style={{ backgroundColor: tokens.color.teal }}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

/** Lowest-effort turn: tap a ready-made reply, zero typing. Good for nervous moments and the
 * conversation's first turn. No scoring — any tap just sends. */
function ChoiceReply({ options, onSubmit, onTypeInstead, disabled }: { options: string[]; onSubmit: (text: string) => void; onTypeInstead: () => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button key={option} type="button" disabled={disabled} onClick={() => onSubmit(option)} className={chipButtonClass}>
            {option}
          </button>
        ))}
      </div>
      <TypeInsteadLink onClick={onTypeInstead} />
    </div>
  );
}

/** Tap shuffled known-word tiles into a "your reply" line, then send. No right answer, no
 * scoring — any order sends; the character reacts and recasts if it reads oddly (never coral,
 * never "incorrect"). Tapping a placed tile removes it (backspace). */
function TilesReply({ tileWords, onSubmit, onTypeInstead, disabled }: { tileWords: string[]; onSubmit: (text: string) => void; onTypeInstead: () => void; disabled?: boolean }) {
  const [pool, setPool] = useState(tileWords);
  const [placed, setPlaced] = useState<string[]>([]);

  function place(index: number) {
    if (disabled) return;
    setPlaced((p) => [...p, pool[index]]);
    setPool((p) => p.filter((_, i) => i !== index));
  }

  function unplace(index: number) {
    if (disabled) return;
    setPool((p) => [...p, placed[index]]);
    setPlaced((p) => p.filter((_, i) => i !== index));
  }

  function send() {
    const text = placed.join(' ').trim();
    if (!text || disabled) return;
    onSubmit(text);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-2xl border-2 border-dashed border-line bg-surfaceAlt px-3 py-2">
        {placed.length === 0 && <span className="text-xs text-muted">Tap tiles below to build your reply…</span>}
        {placed.map((word, i) => (
          <button
            key={`${word}-${i}`}
            type="button"
            disabled={disabled}
            onClick={() => unplace(i)}
            className="rounded-pill px-3 py-1.5 text-sm font-semibold text-white transition-transform active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: tokens.color.teal }}
          >
            {word}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {pool.map((word, i) => (
          <button key={`${word}-${i}`} type="button" disabled={disabled} onClick={() => place(i)} className={chipButtonClass}>
            {word}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <TypeInsteadLink onClick={onTypeInstead} />
        <button
          type="button"
          onClick={send}
          disabled={disabled || placed.length === 0}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-transform active:scale-95 disabled:opacity-40"
          style={{ backgroundColor: tokens.color.teal }}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

/** SEAM 1 — the reply slot. `mode` picks the renderer; the thread and the turn endpoint must
 * never know which one produced the text, only that `onSubmit(text)` fired. Every renderer other
 * than "type" itself falls back to "type" the moment its scaffold is missing/empty, or the user
 * taps "type instead" — never a dead end. */
export function ReplySlot({ mode, scaffold, onSubmit, disabled }: ReplySlotProps) {
  const [forcedType, setForcedType] = useState(false);

  if (!forcedType && mode === 'choice' && scaffold?.options && scaffold.options.length >= 2) {
    return <ChoiceReply options={scaffold.options} onSubmit={onSubmit} onTypeInstead={() => setForcedType(true)} disabled={disabled} />;
  }

  if (!forcedType && mode === 'tiles' && scaffold?.tileWords && scaffold.tileWords.length > 0) {
    return <TilesReply tileWords={scaffold.tileWords} onSubmit={onSubmit} onTypeInstead={() => setForcedType(true)} disabled={disabled} />;
  }

  return <TypeReply onSubmit={onSubmit} disabled={disabled} rustyWords={scaffold?.rustyWords} />;
}
