import { Module } from '@nestjs/common';
import { ImageService } from './image.service';

/** `ImageService` has no constructor dependencies (it reads `process.env` directly per call, same
 * as `GroqAdapter` in `@wortgarten/ai`), so there's no cross-Nest-version DI factory needed here —
 * this module works identically whether the host app is on Nest v10 (apps/worker) or v11 (apps/api). */
@Module({
  providers: [ImageService],
  exports: [ImageService],
})
export class ImagesModule {}
