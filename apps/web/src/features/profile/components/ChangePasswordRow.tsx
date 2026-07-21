import { useState } from 'react';
import { authClient } from '@/lib/authClient';
import { tokens } from '@/design/tokens';

/** Reuses the existing reset-password flow (`ForgotPasswordPage`'s exact call) instead of
 * building a second current-password-based change flow. */
export function ChangePasswordRow({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setSending(true);
    setError(null);
    const { error: resetError } = await authClient.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSending(false);

    if (resetError) {
      setError(resetError.message ?? 'Could not send a reset link. Try again.');
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="font-bold" style={{ color: tokens.color.ink }}>
          Password
        </p>
        {sent ? (
          <p className="text-sm text-muted">Check your email for a reset link.</p>
        ) : (
          <p className="text-sm text-muted">Send yourself a reset link to change it.</p>
        )}
        {error && <p className="text-xs font-semibold text-coral">{error}</p>}
      </div>
      {!sent && (
        <button type="button" onClick={handleClick} disabled={sending} className="text-sm font-bold text-teal disabled:opacity-40">
          {sending ? 'Sending…' : 'Change password'}
        </button>
      )}
    </div>
  );
}
