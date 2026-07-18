import { useId } from 'react';
import { Home, Type, BookOpen, BarChart2, Plus, LogOut, Sprout } from 'lucide-react';
import { SidebarNavItem } from '@/components/ui/SidebarNavItem';
import { Avatar } from '@/components/ui/Avatar';
import { SketchBox } from '@/components/ui/SketchBox';
import { Link, useNavigate } from 'react-router-dom';
import { authClient } from '@/lib/authClient';
import { tokens } from '@/design/tokens';

const NAV = [
  { to: '/', icon: <Home size={18} />, label: 'Home' },
  { to: '/words', icon: <Type size={18} />, label: 'My Words' },
  { to: '/read', icon: <BookOpen size={18} />, label: 'Read' },
  { to: '/progress', icon: <BarChart2 size={18} />, label: 'Progress' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const seed = `sidebar-${useId()}`;

  async function handleLogout() {
    await authClient.signOut();
    navigate('/login');
  }

  return (
    <aside className="fixed left-6 top-6 bottom-6 z-40" style={{ width: tokens.component.nav.sidebarWidth }}>
      <SketchBox seed={seed} fill={tokens.color.surface} stroke={tokens.color.ink} className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex items-center gap-2 px-5 py-5">
          <Sprout size={24} style={{ color: tokens.color.teal }} />
          <span className="text-lg font-extrabold" style={{ color: tokens.color.ink }}>
            Wortgarten
          </span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 px-3">
          {NAV.map((item) => (
            <SidebarNavItem key={item.to} to={item.to} icon={item.icon} label={item.label} />
          ))}
        </nav>

        {/* Add words button */}
        <div className="px-3 pt-4">
          <Link to="/add" className="block">
            <span
              className="flex w-full items-center justify-center gap-2 text-sm font-bold text-white transition-colors hover:brightness-[1.06]"
              style={{ backgroundColor: tokens.color.teal, borderRadius: tokens.sketch.radiusA, paddingTop: 10, paddingBottom: 10 }}
            >
              <Plus size={16} />
              Add words
            </span>
          </Link>
        </div>

        {/* User block */}
        <div className="mt-auto flex items-center gap-3 px-4 py-4" style={{ borderTop: `1px solid ${tokens.color.lineSoft}` }}>
          <Avatar name={user?.name} src={user?.image ?? undefined} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold" style={{ color: tokens.color.ink }}>
              {user?.name ?? '…'}
            </p>
            <p className="truncate text-xs" style={{ color: tokens.color.muted }}>
              {user?.email ?? ''}
            </p>
          </div>
          <button
            onClick={handleLogout}
            aria-label="Log out"
            className="transition-colors hover:opacity-100"
            style={{ color: tokens.color.muted }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </SketchBox>
    </aside>
  );
}
