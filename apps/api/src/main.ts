import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../../.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // bodyParser: false is required by Better Auth, which reads the raw request
  // body itself; the nestjs-better-auth integration re-adds parsers for
  // non-auth routes.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  const webOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim());

  app.enableCors({
    origin: webOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  const port = process.env.API_PORT ?? 3026;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
}

bootstrap();
