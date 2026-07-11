import { Home, Type, BookOpen, BarChart2, Plus, LogOut, Sprout } from 'lucide-react';
import { SidebarNavItem } from '@/components/ui/SidebarNavItem';
import { Avatar } from '@/components/ui/Avatar';
import { Link, useNavigate } from 'react-router-dom';
import { authClient } from '@/lib/authClient';

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

  async function handleLogout() {
    await authClient.signOut();
    navigate('/login');
  }

  return (
    <aside className="fixed left-6 top-6 bottom-6 z-40 flex w-56 flex-col rounded-card bg-card shadow-card">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5">
        <Sprout size={24} className="text-primary" />
        <span className="text-lg font-extrabold text-deep">Wortgarten</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 px-3">
        {NAV.map((item) => (
          <SidebarNavItem key={item.to} to={item.to} icon={item.icon} label={item.label} />
        ))}
      </nav>

      {/* Add words button */}
      <div className="px-3 pt-4">
        <Link
          to="/add"
          className="flex w-full items-center justify-center gap-2 rounded-pill bg-primary py-2.5 text-sm font-bold text-white transition-colors hover:brightness-110"
        >
          <Plus size={16} />
          Add words
        </Link>
      </div>

      {/* User block */}
      <div className="mt-auto flex items-center gap-3 border-t border-gray-100 px-4 py-4">
        <Avatar name={user?.name} src={user?.image ?? undefined} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-deep">{user?.name ?? '…'}</p>
          <p className="truncate text-xs text-muted">{user?.email ?? ''}</p>
        </div>
        <button
          onClick={handleLogout}
          aria-label="Log out"
          className="text-muted hover:text-deep transition-colors"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
