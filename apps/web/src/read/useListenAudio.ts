import { useEffect, useRef, useState } from 'react';
import { pauseActiveListenAudio, registerActiveListenAudio, unregisterActiveListenAudio } from '@/lib/listenAudioRegistry';

export type ListenSpeed = 0.75 | 1;

/** Owns the single `<audio>` element for Listen Mode. `currentTimeMs` only advances via
 * `requestAnimationFrame` while actually playing — no polling timer running for a paused/absent
 * story. `isPlaying` is driven entirely by the audio element's own `play`/`pause` events (not a
 * locally-toggled flag) so it stays correct even when something else pauses this element — see
 * `pauseActiveListenAudio` (word-tap pronunciation stopping Listen Mode, and vice versa). */
export function useListenAudio(audioUrl: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [speed, setSpeed] = useState<ListenSpeed>(1);

  useEffect(() => {
    if (!audioUrl) return;

    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    registerActiveListenAudio(audio);

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTimeMs(0);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      unregisterActiveListenAudio(audio);
      audioRef.current = null;
      setIsPlaying(false);
      setCurrentTimeMs(0);
    };
  }, [audioUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    if (!isPlaying) return;
    function tick() {
      if (audioRef.current) setCurrentTimeMs(audioRef.current.currentTime * 1000);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      pauseActiveListenAudio(); // in practice a no-op on itself, but keeps the invariant explicit
      window.speechSynthesis?.cancel();
      audio.play().catch(() => {}); // autoplay/user-gesture rejection — never crash the reader over it
    } else {
      audio.pause();
    }
  }

  return { isPlaying, currentTimeMs, speed, setSpeed, toggle };
}
