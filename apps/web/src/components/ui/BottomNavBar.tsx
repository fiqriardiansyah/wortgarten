import { useId } from 'react';
import type { ReactNode } from 'react';
import { Link, useMatch } from 'react-router-dom';
import { Home, Type, BookOpen, MessageCircle, BarChart2, Plus } from 'lucide-react';
import { tokens } from '@/design/tokens';
import { SketchBox } from '@/components/ui/SketchBox';

const NAV = [
  { to: '/', icon: <Home size={20} />, label: 'Home' },
  { to: '/words', icon: <Type size={20} />, label: 'Words' },
  { to: '/read', icon: <BookOpen size={20} />, label: 'Read' },
  { to: '/chats', icon: <MessageCircle size={20} />, label: 'Chats' },
  { to: '/progress', icon: <BarChart2 size={20} />, label: 'Progress' },
];

function NavItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  const active = useMatch(to === '/' ? '/' : `${to}/*`);

  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-xs transition-colors"
      style={{ color: active ? tokens.color.teal : tokens.color.muted }}
    >
      <span aria-hidden className="flex leading-none">
        {icon}
      </span>
      <span className={active ? 'font-extrabold' : 'font-semibold'}>{label}</span>
      <span aria-hidden className="h-1 w-1 rounded-full" style={{ backgroundColor: active ? tokens.color.teal : 'transparent' }} />
    </Link>
  );
}

export function BottomNavBar() {
  const mid = Math.floor(NAV.length / 2);
  const left = NAV.slice(0, mid);
  const right = NAV.slice(mid);
  const seed = `bottomnav-${useId()}`;

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed left-4 right-4 z-50 mx-auto max-w-2xl"
      style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <SketchBox
        seed={seed}
        fill={tokens.color.surface}
        stroke={tokens.color.ink}
        style={{ height: tokens.component.nav.mobileBarHeight  }}
      >
        <div className="flex h-full items-center px-2">
          {left.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}

          <Link
            to="/add"
            aria-label="Add words"
            className="mx-1 flex shrink-0 items-center justify-center rounded-full text-white transition-transform active:scale-95"
            style={{
              width: tokens.component.nav.fabSize,
              height: tokens.component.nav.fabSize,
              backgroundColor: tokens.color.teal,
              transform: `translateY(-${tokens.component.nav.fabFloat}px)`,
            }}
          >
            <Plus size={28} strokeWidth={3.5} />
          </Link>

          {right.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </div>
      </SketchBox>
    </nav>
  );
}
