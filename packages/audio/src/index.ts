export { AudioService } from './audio.service';
export type { GenerateStoryAudioResult } from './audio.service';
export { AudioModule } from './audio.module';
export { attachStoryAudio } from './attach-audio';
export { deriveAudioUrl } from './derive-url';
export { alignWordTimings, buildAudioSync } from './align';
export type { AlignmentResult, AudioSyncResult } from './align';
export { synthesizeGerman } from './edge-tts.client';
export type { EdgeTtsResult, EdgeTtsWordBoundary } from './edge-tts.client';
