import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, X } from 'lucide-react';
import { authClient } from '@/lib/authClient';
import { tokens } from '@/design/tokens';
import { SavedIndicator } from './SavedIndicator';

export function InlineEditableName({ name }: { name: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(0);

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) {
      setEditing(false);
      setValue(name);
      return;
    }

    setSaving(true);
    setError(null);
    const { error: updateError } = await authClient.updateUser({ name: trimmed });
    // The session store should sync itself; force a refresh in case it doesn't.
    await authClient.getSession();
    setSaving(false);

    if (updateError) {
      setError(updateError.message ?? 'Could not update your name.');
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
    setEditing(false);
    setSavedTick((t) => t + 1);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-lg font-extrabold" style={{ color: tokens.color.ink }}>
          {name}
        </p>
        <button
          type="button"
          aria-label="Edit display name"
          onClick={() => {
            setValue(name);
            setEditing(true);
          }}
          className="text-muted transition-colors hover:text-ink"
        >
          <Pencil size={14} />
        </button>
        <SavedIndicator tick={savedTick} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-col items-start gap-2">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') {
                setValue(name);
                setEditing(false);
              }
            }}
            disabled={saving}
            className="border-b-2 bg-transparent text-lg font-extrabold outline-none"
            style={{ color: tokens.color.ink, borderColor: tokens.color.teal }}
          />
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => {
              setValue(name);
              setEditing(false);
            }}
            className="text-muted hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>
        <button
          type="button"
          aria-label="Save name"
          onClick={handleSave}
          disabled={saving}
          className="text-sm font-bold text-teal disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>

      </div>
      {error && <p className="text-xs font-semibold text-coral">{error}</p>}
    </div>
  );
}
