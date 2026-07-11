import { Outlet, useNavigate } from 'react-router-dom';
import { LogOut, Sprout } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { BottomNavBar } from '@/components/ui/BottomNavBar';
import { Avatar } from '@/components/ui/Avatar';
import { authClient } from '@/lib/authClient';

const SPARKLES = [
  { top: '8%', left: '15%', size: 14, opacity: 0.25 },
  { top: '22%', left: '72%', size: 10, opacity: 0.2 },
  { top: '55%', left: '90%', size: 16, opacity: 0.18 },
  { top: '78%', left: '5%', size: 12, opacity: 0.22 },
  { top: '40%', left: '48%', size: 8, opacity: 0.15 },
];

function Sparkle({ top, left, size, opacity }: { top: string; left: string; size: number; opacity: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute select-none text-primary"
      style={{ top, left, fontSize: size, opacity }}
    >
      ✦
    </span>
  );
}

export function AppLayout() {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const user = session?.user;

  async function handleLogout() {
    await authClient.signOut();
    navigate('/login');
  }

  return (
    <div className="relative min-h-screen bg-page font-sans">
      {SPARKLES.map((s, i) => (
        <Sparkle key={i} {...s} />
      ))}

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile top bar */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4 lg:hidden">
        <div className="flex items-center gap-2">
          <Sprout size={20} className="text-primary" />
          <span className="font-extrabold text-deep">Wortgarten</span>
        </div>
        <div className="flex items-center gap-2">
          <Avatar name={user?.name} src={user?.image ?? undefined} size="sm" />
          <button
            onClick={handleLogout}
            aria-label="Log out"
            className="text-muted hover:text-deep transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Main content */}
      <main className="lg:ml-72 min-h-screen">
        <div className="mx-auto max-w-5xl px-4 py-6 pb-24 lg:pb-8 lg:px-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <div className="lg:hidden">
        <BottomNavBar />
      </div>
    </div>
  );
}
