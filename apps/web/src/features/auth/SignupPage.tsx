import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CURRENT_TERMS_VERSION } from '@wortgarten/shared';
import { authClient } from '@/lib/authClient';
import { Button } from '@/components/ui/Button';
import { PENDING_TERMS_ACCEPTANCE_KEY } from '@/features/profile/api/pendingTermsAcceptance';
import { useAcceptTerms } from '@/features/profile/api/useAcceptTerms';
import { AuthShell } from './components/AuthShell';
import { AuthTextField } from './components/AuthTextField';
import { GoogleButton } from './components/GoogleButton';

export function SignupPage() {
  const navigate = useNavigate();
  const acceptTerms = useAcceptTerms();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!agreed) return;
    setError(null);
    setSubmitting(true);

    const { error: signUpError } = await authClient.signUp.email({ name, email, password });

    if (signUpError) {
      setSubmitting(false);
      setError(signUpError.message ?? 'Could not create your account. Try again.');
      return;
    }

    // Best-effort: a fresh account should record what it agreed to, but a failure here must
    // never block the user from reaching the app they just successfully signed up for.
    await acceptTerms.mutateAsync(CURRENT_TERMS_VERSION).catch(() => {});

    setSubmitting(false);
    navigate('/');
  }

  function handleGoogleSignup() {
    if (!agreed) return;
    // The OAuth redirect leaves this page entirely, so there's no "after" here to record
    // acceptance from — AppLayout picks this flag up once the redirect lands the user back
    // signed in (see AppLayout.tsx).
    sessionStorage.setItem(PENDING_TERMS_ACCEPTANCE_KEY, CURRENT_TERMS_VERSION);
    authClient.signIn.social({ provider: 'google', callbackURL: window.location.origin + '/' });
  }

  return (
    <AuthShell
      title="Plant your Wortgarten"
      subtitle="Create an account to start learning German"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-teal">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthTextField
          label="Name"
          type="text"
          name="name"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <AuthTextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthTextField
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <label className="flex items-start gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>
            I agree to the{' '}
            <a href="/terms" target="_blank" rel="noreferrer" className="font-semibold text-teal hover:underline">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-teal hover:underline">
              Privacy Policy
            </a>
            .
          </span>
        </label>

        {error && <p className="text-sm font-semibold text-coral">{error}</p>}

        <Button type="submit" disabled={!agreed || submitting} className="w-full justify-center">
          {submitting ? 'Creating account…' : 'Sign up'}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-line" />
        <span className="text-xs font-semibold text-muted">OR</span>
        <div className="h-px flex-1 bg-line" />
      </div>

      <GoogleButton onClick={handleGoogleSignup} disabled={!agreed} />
    </AuthShell>
  );
}
