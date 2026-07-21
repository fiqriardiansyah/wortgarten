import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authClient } from '@/lib/authClient';
import { tokens } from '@/design/tokens';

export function LogoutRow() {
  const navigate = useNavigate();

  async function handleLogout() {
    await authClient.signOut();
    navigate('/login');
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="flex items-center gap-2 text-sm font-bold transition-colors hover:text-ink"
      style={{ color: tokens.color.inkSoft }}
    >
      <LogOut size={16} />
      Log out
    </button>
  );
}
