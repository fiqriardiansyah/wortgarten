import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authClient } from '@/lib/authClient';
import { Button } from '@/components/ui/Button';
import { AuthShell } from './components/AuthShell';
import { AuthTextField } from './components/AuthTextField';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const tokenError = searchParams.get('error');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!token) {
      setError('This reset link is missing its token.');
      return;
    }

    setSubmitting(true);
    const { error: resetError } = await authClient.resetPassword({ newPassword, token });
    setSubmitting(false);

    if (resetError) {
      setError(resetError.message ?? 'Could not reset your password. Request a new link.');
      return;
    }

    navigate('/login');
  }

  if (!token || tokenError) {
    return (
      <AuthShell
        title="Reset link invalid"
        subtitle="This link is expired or has already been used"
        footer={
          <Link to="/forgot-password" className="font-bold text-teal">
            Request a new link
          </Link>
        }
      >
        <p className="text-sm text-ink">Request a fresh password reset link and try again.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      footer={
        <Link to="/login" className="font-bold text-teal">
          Back to log in
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthTextField
          label="New password"
          type="password"
          name="newPassword"
          autoComplete="new-password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <AuthTextField
          label="Confirm password"
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        {error && <p className="text-sm font-semibold text-coral">{error}</p>}

        <Button type="submit" className="w-full justify-center">
          {submitting ? 'Resetting…' : 'Reset password'}
        </Button>
      </form>
    </AuthShell>
  );
}
