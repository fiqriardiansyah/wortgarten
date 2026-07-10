import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { BottomNavBar } from '@/components/ui/BottomNavBar';

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
  return (
    <div className="relative min-h-screen bg-page font-sans">
      {SPARKLES.map((s, i) => (
        <Sparkle key={i} {...s} />
      ))}

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
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
