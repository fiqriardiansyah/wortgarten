/** Tiny singleton so word-tap pronunciation (`SpeakButton`/`useGermanVoice`) and whole-story Listen
 * Mode playback can never sound both at once — starting one must stop the other. A React context
 * would need to be threaded from `ReaderPage` down through `WordPopup`, several levels away from
 * `ListenControl`; a module-level singleton is the simpler wire for "there is at most one Listen
 * Mode `<audio>` element on screen at a time." */
let activeAudio: HTMLAudioElement | null = null;

export function registerActiveListenAudio(audio: HTMLAudioElement): void {
  activeAudio = audio;
}

export function unregisterActiveListenAudio(audio: HTMLAudioElement): void {
  if (activeAudio === audio) activeAudio = null;
}

export function pauseActiveListenAudio(): void {
  activeAudio?.pause();
}
