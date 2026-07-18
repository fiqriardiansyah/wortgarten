import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authClient } from '@/lib/authClient';
import { Button } from '@/components/ui/Button';
import { AuthShell } from './components/AuthShell';
import { AuthTextField } from './components/AuthTextField';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error: resetError } = await authClient.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setSubmitting(false);

    if (resetError) {
      setError(resetError.message ?? 'Could not send a reset link. Try again.');
      return;
    }

    setSent(true);
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="We'll send a reset link to your email"
      footer={
        <Link to="/login" className="font-bold text-teal">
          Back to log in
        </Link>
      }
    >
      {sent ? (
        <p className="text-sm text-ink">
          If an account exists for <span className="font-bold">{email}</span>, a reset link is on its way. In dev,
          check the API console log for the link.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <AuthTextField
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {error && <p className="text-sm font-semibold text-coral">{error}</p>}

          <Button type="submit" className="w-full justify-center">
            {submitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
