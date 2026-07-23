import { useEffect, useState } from 'react';
import { pauseActiveListenAudio } from '@/lib/listenAudioRegistry';

// undefined = not resolved yet, null = resolved to "no German voice on this device"
let cachedVoice: SpeechSynthesisVoice | null | undefined;

function pickGermanVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const exact = (lang: string) => voices.find((v) => v.lang === lang);
  return exact('de-DE') ?? exact('de-AT') ?? exact('de-CH') ?? voices.find((v) => v.lang.startsWith('de')) ?? null;
}

/** Resolves the on-device German voice once and caches it module-wide so every `<SpeakButton>`
 * skips re-scanning. `getVoices()` is often empty on the first call, so we wait for
 * `voiceschanged` before giving up. No German voice found → `supported` stays false forever;
 * callers must hide their UI rather than fall back to an English-accented voice. */
export function useGermanVoice() {
  const [voice, setVoice] = useState(cachedVoice);

  useEffect(() => {
    if (cachedVoice !== undefined) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      cachedVoice = null;
      setVoice(null);
      return;
    }

    function resolve() {
      const available = window.speechSynthesis.getVoices();
      if (available.length === 0) return; // still loading — wait for voiceschanged
      const found = pickGermanVoice(available);
      cachedVoice = found;
      setVoice(found);
    }

    resolve();
    window.speechSynthesis.addEventListener('voiceschanged', resolve);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', resolve);
  }, []);

  function speak(text: string) {
    if (!voice) return;
    try {
      pauseActiveListenAudio(); // never let single-word pronunciation overlap Listen Mode playback
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = 0.9;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Speech is best-effort — never crash the screen over it.
    }
  }

  return { speak, supported: voice != null };
}
