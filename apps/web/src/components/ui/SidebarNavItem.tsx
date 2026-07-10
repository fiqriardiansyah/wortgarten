import type { ReactNode } from 'react';
import { Link, useMatch } from 'react-router-dom';

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
      className={`flex items-center gap-3 rounded-pill px-4 py-2.5 text-sm font-semibold transition-colors ${
        active
          ? 'bg-primary text-white'
          : 'text-muted hover:bg-lilac hover:text-deep'
      }`}
    >
      <span className="h-5 w-5 flex-shrink-0">{icon}</span>
      {label}
    </Link>
  );
}
