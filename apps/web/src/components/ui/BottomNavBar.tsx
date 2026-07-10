import { Link, useMatch } from 'react-router-dom';
import { Home, BookOpen, BarChart2, Type, Plus } from 'lucide-react';

const NAV = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/words', icon: Type, label: 'Words' },
  { to: '/read', icon: BookOpen, label: 'Read' },
  { to: '/progress', icon: BarChart2, label: 'Progress' },
];

function NavItem({ to, icon: Icon, label }: { to: string; icon: typeof Home; label: string }) {
  const active = useMatch(to === '/' ? '/' : `${to}/*`);
  return (
    <Link
      to={to}
      className={`flex flex-col items-center gap-0.5 p-2 text-xs font-semibold transition-colors ${
        active ? 'text-primary' : 'text-muted'
      }`}
    >
      <Icon size={22} />
      {label}
    </Link>
  );
}

export function BottomNavBar() {
  const mid = Math.floor(NAV.length / 2);
  const left = NAV.slice(0, mid);
  const right = NAV.slice(mid);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-end justify-around bg-white px-2 pb-safe pt-2 shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
      {left.map((item) => (
        <NavItem key={item.to} {...item} />
      ))}

      {/* Raised center Add button */}
      <Link
        to="/add"
        className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-card transition-transform active:scale-95"
      >
        <Plus size={28} />
      </Link>

      {right.map((item) => (
        <NavItem key={item.to} {...item} />
      ))}
    </div>
  );
}
