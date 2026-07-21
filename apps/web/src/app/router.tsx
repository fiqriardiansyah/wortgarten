import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Sprout } from 'lucide-react';
import { authClient } from '@/lib/authClient';
import { tokens } from '@/design/tokens';
import { AppLayout } from './layout/AppLayout';
import { HomePage } from '@/features/home/HomePage';
import { LoginPage } from '@/features/auth/LoginPage';
import { SignupPage } from '@/features/auth/SignupPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { AddWordsPage } from '@/features/add-words/AddWordsPage';
import { SessionPage } from '@/features/session/SessionPage';
import { WordsPage } from '@/features/words/WordsPage';
import { WordDetailPage } from '@/features/words/detail/WordDetailPage';
import { ProgressPage } from '@/features/progress/ProgressPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { AboutPage } from '@/features/about/AboutPage';
import { PrivacyPage } from '@/features/legal/PrivacyPage';
import { TermsPage } from '@/features/legal/TermsPage';
import { ReadPage } from '@/read/ReadPage';
import { AllStoriesPage } from '@/read/AllStoriesPage';
import { ReaderPage } from '@/read/ReaderPage';

function AuthLoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 font-sans" style={{ backgroundColor: tokens.color.bg }}>
      <Sprout size={28} className="animate-pulse" style={{ color: tokens.color.teal }} />
      <p className="text-sm font-semibold text-muted">Loading…</p>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession();

  if (isPending) return <AuthLoadingScreen />;
  if (!data) return <Navigate to="/login" replace />;

  return children;
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

function RequireGuest({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession();

  if (isPending) return <AuthLoadingScreen />;
  if (data) return <Navigate to="/" replace />;

  return children;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route
          path="/login"
          element={
            <RequireGuest>
              <LoginPage />
            </RequireGuest>
          }
        />
        <Route
          path="/signup"
          element={
            <RequireGuest>
              <SignupPage />
            </RequireGuest>
          }
        />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        {/* Public, no login required — a prospective user must be able to read these before signing up. */}
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />

        <Route
          path="/session"
          element={
            <RequireAuth>
              <SessionPage />
            </RequireAuth>
          }
        />

        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<HomePage />} />
          <Route path="/words" element={<WordsPage />} />
          <Route path="/words/:id" element={<WordDetailPage />} />
          <Route path="/read" element={<ReadPage />} />
          <Route path="/read/all" element={<AllStoriesPage />} />
          <Route path="/read/:id" element={<ReaderPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/add" element={<AddWordsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/about" element={<AboutPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
