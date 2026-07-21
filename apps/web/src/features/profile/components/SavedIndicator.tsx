import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check } from 'lucide-react';
import { tokens } from '@/design/tokens';

/** Fires a brief "Saved" flash next to a control — the app has no global toast system, so every
 * inline setting shows its own quiet confirmation instead of one. Bump `tick` on each successful save. */
export function SavedIndicator({ tick }: { tick: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (tick === 0) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 1500);
    return () => clearTimeout(timer);
  }, [tick]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.span
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          className="inline-flex items-center gap-1 text-xs font-bold"
          style={{ color: tokens.color.tealDeep }}
        >
          <Check size={13} /> Saved
        </motion.span>
      )}
    </AnimatePresence>
  );
}
