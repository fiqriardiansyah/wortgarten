import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authClient } from '@/lib/authClient';
import { Button } from '@/components/ui/Button';
import { AuthShell } from './components/AuthShell';
import { AuthTextField } from './components/AuthTextField';
import { GoogleButton } from './components/GoogleButton';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error: signInError } = await authClient.signIn.email({ email, password });

    setSubmitting(false);

    if (signInError) {
      setError(signInError.message ?? 'Could not log in. Check your details and try again.');
      return;
    }

    navigate('/');
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to keep growing your Wortgarten"
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="font-bold text-teal">
            Sign up
          </Link>
        </>
      }
    >
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
        <AuthTextField
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div className="-mt-2 text-right">
          <Link to="/forgot-password" className="text-xs font-semibold text-muted hover:text-teal">
            Forgot password?
          </Link>
        </div>

        {error && <p className="text-sm font-semibold text-coral">{error}</p>}

        <Button type="submit" className="w-full justify-center">
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-line" />
        <span className="text-xs font-semibold text-muted">OR</span>
        <div className="h-px flex-1 bg-line" />
      </div>

      <GoogleButton
        onClick={() =>
          authClient.signIn.social({ provider: 'google', callbackURL: window.location.origin + '/' })
        }
      />

      <p className="mt-5 text-center text-xs text-muted">
        <a href="/terms" target="_blank" rel="noreferrer" className="font-semibold hover:text-teal hover:underline">
          Terms of Service
        </a>{' '}
        &middot;{' '}
        <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold hover:text-teal hover:underline">
          Privacy Policy
        </a>
      </p>
    </AuthShell>
  );
}
