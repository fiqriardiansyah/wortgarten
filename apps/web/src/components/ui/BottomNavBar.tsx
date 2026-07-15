import { Link, useMatch } from 'react-router-dom';
import { Plus } from 'lucide-react';

const NAV = [
  { to: '/', icon: '🏠', label: 'Home' },
  { to: '/words', icon: '🌸', label: 'Words' },
  { to: '/read', icon: '📖', label: 'Read' },
  { to: '/progress', icon: '📊', label: 'Progress' },
];

function NavItem({ to, icon, label }: { to: string; icon: string; label: string }) {
  const active = useMatch(to === '/' ? '/' : `${to}/*`);

  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-xs transition-colors ${
        active ? 'text-primary' : 'text-muted'
      }`}
    >
      <span aria-hidden className="text-[20px] leading-none">
        {icon}
      </span>
      <span className={active ? 'font-extrabold' : 'font-semibold'}>{label}</span>
      <span
        aria-hidden
        className={`h-1 w-1 rounded-full ${active ? 'bg-primary' : 'bg-transparent'}`}
      />
    </Link>
  );
}

export function BottomNavBar() {
  const mid = Math.floor(NAV.length / 2);
  const left = NAV.slice(0, mid);
  const right = NAV.slice(mid);

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed left-4 right-4 z-50 mx-auto flex h-24 max-w-2xl items-center rounded-3xl bg-white px-2 shadow-card"
      style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      {left.map((item) => (
        <NavItem key={item.to} {...item} />
      ))}

      <Link
        to="/add"
        aria-label="Add words"
        className="mx-1 flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-card transition-transform active:scale-95"
      >
        <Plus size={30} strokeWidth={3.5} />
      </Link>

      {right.map((item) => (
        <NavItem key={item.to} {...item} />
      ))}
    </nav>
  );
}
