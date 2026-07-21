import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'wortgarten:tts-enabled';

function readStored(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(STORAGE_KEY) !== 'off';
}

/** Device-local pronunciation preference — voice availability is already per-device (see
 * `useGermanVoice`), so this stays in localStorage rather than the account. */
export function useTtsPreference() {
  const [enabled, setEnabledState] = useState(readStored);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) setEnabledState(readStored());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    setEnabledState(next);
  }, []);

  return { enabled, setEnabled };
}
