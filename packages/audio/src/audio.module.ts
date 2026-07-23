import { Module } from '@nestjs/common';
import { AudioService } from './audio.service';

/** `AudioService` has no constructor dependencies (it reads `process.env` directly per call, same
 * as `ImagesModule`'s `ImageService`), so there's no cross-Nest-version DI factory needed here —
 * this module works identically whether the host app is on Nest v10 (apps/worker) or v11 (apps/api). */
@Module({
  providers: [AudioService],
  exports: [AudioService],
})
export class AudioModule {}
