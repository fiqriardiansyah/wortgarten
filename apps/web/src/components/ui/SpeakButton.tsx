import { motion } from 'motion/react';
import { Volume2 } from 'lucide-react';
import { pressSpring } from '@/design/motion';
import { useGermanVoice } from '@/lib/useGermanVoice';

interface SpeakButtonProps {
  /** The exact string to speak — word only, e.g. `displayForm(lexeme)`. Never a sentence. */
  text: string;
  size?: number;
  className?: string;
}

/** Speaks a German word aloud via the on-device Web Speech API. Renders nothing when the device
 * has no German voice installed — an English-accented fallback is worse than no button. */
export function SpeakButton({ text, size = 16, className = '' }: SpeakButtonProps) {
  const { speak, supported } = useGermanVoice();
  if (!supported) return null;

  return (
    <motion.button
      type="button"
      aria-label="Play pronunciation"
      whileTap={{ scale: 0.96 }}
      transition={pressSpring}
      onClick={(event) => {
        event.stopPropagation();
        speak(text);
      }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-teal hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 ${className}`}
    >
      <Volume2 size={size} aria-hidden />
    </motion.button>
  );
}
