import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { authClient } from '@/lib/authClient';
import { tokens } from '@/design/tokens';
import { useDeleteAccount } from '../api/useDeleteAccount';

export function DeleteAccountDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const mutation = useDeleteAccount();

  const matches = confirmText.trim().toLowerCase() === email.toLowerCase();

  async function handleDelete() {
    setError(null);
    mutation.mutate(confirmText.trim(), {
      onSuccess: async () => {
        await authClient.signOut();
        navigate('/login');
      },
      onError: () => setError('Could not delete your account. Try again.'),
    });
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm"
        >
          <Card hover={false} stroke={tokens.color.coral}>
            <p className="font-extrabold" style={{ color: tokens.color.coralDeep }}>
              Delete your account
            </p>
            <p className="mt-2 text-sm text-ink">This permanently deletes:</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-ink">
              <li>Your collected words and review history</li>
              <li>Your streak</li>
              <li>Your generated stories</li>
            </ul>
            <p className="mt-3 text-sm text-muted">
              Type your email (<span className="font-semibold text-ink">{email}</span>) to confirm.
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={email}
              autoFocus
              className="mt-2 w-full rounded-sketch border-2 bg-surface px-3 py-2 text-sm"
              style={{ borderColor: tokens.color.line, color: tokens.color.ink }}
            />
            {error && <p className="mt-2 text-xs font-semibold text-coral">{error}</p>}
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={onClose} className="text-sm font-bold text-muted hover:text-ink">
                Cancel
              </button>
              <Button variant="coral" disabled={!matches || mutation.isPending} onClick={handleDelete}>
                {mutation.isPending ? 'Deleting…' : 'Delete account'}
              </Button>
            </div>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
