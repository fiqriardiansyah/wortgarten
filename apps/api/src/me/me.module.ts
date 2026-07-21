import { Module } from '@nestjs/common';
import { ImagesModule } from '@wortgarten/images';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  imports: [ImagesModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
