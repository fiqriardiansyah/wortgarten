import type { ReactNode } from 'react';
import { Link, useMatch } from 'react-router-dom';
import { tokens } from '@/design/tokens';

interface SidebarNavItemProps {
  to: string;
  icon: ReactNode;
  label: string;
}

export function SidebarNavItem({ to, icon, label }: SidebarNavItemProps) {
  const active = useMatch(to === '/' ? '/' : `${to}/*`);

  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-4 text-sm font-semibold transition-colors ${active ? '' : 'hover:bg-teal-soft hover:text-ink'}`}
      style={{
        height: tokens.component.nav.itemHeight,
        borderRadius: tokens.sketch.radiusA,
        backgroundColor: active ? tokens.color.teal : 'transparent',
        color: active ? '#FFFFFF' : tokens.color.muted,
      }}
    >
      <span className="h-5 w-5 flex-shrink-0">{icon}</span>
      {label}
    </Link>
  );
}
