import { useEffect } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Sprout } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { BottomNavBar } from '@/components/ui/BottomNavBar';
import { Avatar } from '@/components/ui/Avatar';
import { StreakPill } from '@/components/ui/StreakPill';
import { useHomeQuery } from '@/features/home/api/useHomeQuery';
import { useAcceptTerms } from '@/features/profile/api/useAcceptTerms';
import { PENDING_TERMS_ACCEPTANCE_KEY } from '@/features/profile/api/pendingTermsAcceptance';
import { authClient } from '@/lib/authClient';
import { tokens } from '@/design/tokens';

/** Picks up the flag SignupPage sets before a Google OAuth redirect (that redirect leaves the
 * signup page entirely, so nothing there can await the result and record acceptance itself).
 * Runs once per authenticated mount; a no-op on every load where the flag isn't present. */
function usePendingTermsAcceptance(userId: string | undefined) {
  const acceptTerms = useAcceptTerms();

  useEffect(() => {
    if (!userId) return;
    const version = sessionStorage.getItem(PENDING_TERMS_ACCEPTANCE_KEY);
    if (!version) return;
    sessionStorage.removeItem(PENDING_TERMS_ACCEPTANCE_KEY);
    acceptTerms.mutate(version);
    // acceptTerms is a fresh useMutation identity each render — depending only on userId is
    // deliberate, this must fire exactly once per sessionStorage flag, not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
}

// 6-8 small dots per screen, not 30 (spec §7 "Confetti dots").
const CONFETTI = [
  { top: '8%', left: '15%', size: 6, color: tokens.color.teal },
  { top: '22%', left: '72%', size: 5, color: tokens.color.yellow },
  { top: '55%', left: '90%', size: 7, color: tokens.color.coral },
  { top: '78%', left: '5%', size: 5, color: tokens.color.teal },
  { top: '40%', left: '48%', size: 4, color: tokens.color.yellow },
  { top: '65%', left: '30%', size: 6, color: tokens.color.coral },
];

function ConfettiDot({ top, left, size, color }: { top: string; left: string; size: number; color: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute select-none rounded-full"
      style={{ top, left, width: size, height: size, backgroundColor: color, opacity: tokens.concept.confetti.opacity }}
    />
  );
}

export function AppLayout() {
  const { data: session } = authClient.useSession();
  const { data: home } = useHomeQuery();
  const user = session?.user;
  usePendingTermsAcceptance(user?.id);

  return (
    <div className="relative min-h-screen font-sans" style={{ backgroundColor: tokens.color.bg }}>
      {CONFETTI.map((c, i) => (
        <ConfettiDot key={i} {...c} />
      ))}

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile top bar */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4 lg:hidden">
        <div className="flex items-center gap-2">
          <Sprout size={20} style={{ color: tokens.color.teal }} />
          <span className="font-extrabold" style={{ color: tokens.color.ink }}>
            Wortgarten
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StreakPill days={home?.streak.current ?? 0} compact />
          <Link to="/profile" aria-label="Your profile">
            <Avatar name={user?.name} src={user?.image ?? undefined} size="sm" />
          </Link>
        </div>
      </div>

      {/* Main content */}
      <main className="lg:ml-72 min-h-screen">
        <div className="mx-auto max-w-5xl px-4 py-6 pb-32 lg:pb-8 lg:px-8">
          <Outlet />
        </div>
      </main>

      {/* Fade content behind the floating bottom nav: blur + opacity gradation */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 lg:hidden"
        style={{
          height: '9rem',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          maskImage: 'linear-gradient(to bottom, transparent, black 65%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 65%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 lg:hidden"
        style={{
          height: '9rem',
          background: `linear-gradient(to bottom, transparent, ${tokens.color.bg} 55%)`,
        }}
      />

      {/* Mobile bottom nav */}
      <div className="lg:hidden">
        <BottomNavBar />
      </div>
    </div>
  );
}
