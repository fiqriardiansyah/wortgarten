import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authClient } from '@/lib/authClient';
import { Button } from '@/components/ui/Button';
import { AuthShell } from './components/AuthShell';
import { AuthTextField } from './components/AuthTextField';
import { GoogleButton } from './components/GoogleButton';

export function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error: signUpError } = await authClient.signUp.email({ name, email, password });

    setSubmitting(false);

    if (signUpError) {
      setError(signUpError.message ?? 'Could not create your account. Try again.');
      return;
    }

    navigate('/');
  }

  return (
    <AuthShell
      title="Plant your Wortgarten"
      subtitle="Create an account to start learning German"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-primary">
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

        {error && <p className="text-sm font-semibold text-coral">{error}</p>}

        <Button type="submit" className="w-full justify-center">
          {submitting ? 'Creating account…' : 'Sign up'}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-100" />
        <span className="text-xs font-semibold text-muted">OR</span>
        <div className="h-px flex-1 bg-gray-100" />
      </div>

      <GoogleButton
        onClick={() =>
          authClient.signIn.social({ provider: 'google', callbackURL: window.location.origin + '/' })
        }
      />
    </AuthShell>
  );
}
