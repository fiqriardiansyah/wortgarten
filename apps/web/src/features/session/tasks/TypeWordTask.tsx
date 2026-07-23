import type { RefObject } from 'react';
import type { TypeWordPayload } from '@wortgarten/shared';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { partOfSpeechLabel } from '@/lib/partOfSpeech';
import { tokens } from '@/design/tokens';

const UMLAUT_KEYS = ['ä', 'ö', 'ü', 'ß'];

interface TypeWordTaskProps {
  payload: TypeWordPayload;
  value: string;
  disabled: boolean;
  inputRef: RefObject<HTMLInputElement>;
  onChange: (value: string) => void;
}

/** Screen 2. The ä/ö/ü/ß keys insert at the cursor, not just append. */
export function TypeWordTask({ payload, value, disabled, inputRef, onChange }: TypeWordTaskProps) {
  function insertChar(ch: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + ch + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + 1, start + 1);
    });
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Type the German word</p>

      <Card hover={false} className="mt-3 text-center">
        <p className="text-hero-sm font-extrabold text-ink">{payload.prompt}</p>
        <p className="mt-1 text-sm text-muted">
          {partOfSpeechLabel[payload.partOfSpeech]}
          {payload.requiresArticle && " · don't forget der/die/das!"}
        </p>
      </Card>

      <Input
        ref={inputRef}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        autoFocus
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className="mt-4 text-center text-hero-sm font-extrabold text-teal"
        style={{ fontSize: 28, fontWeight: 800 }}
      />

      <div className="mt-3 flex justify-center gap-2">
        {UMLAUT_KEYS.map((ch) => (
          <button
            key={ch}
            type="button"
            disabled={disabled}
            onClick={() => insertChar(ch)}
            className="flex items-center justify-center font-bold hover:brightness-95 disabled:opacity-60"
            style={{ width: 52, height: 44, borderRadius: tokens.sketch.cornerRadius, backgroundColor: tokens.color.tealSoft, color: tokens.color.teal }}
          >
            {ch}
          </button>
        ))}
      </div>
    </div>
  );
}
