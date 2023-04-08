import { NestFactory } from '@nestjs/core';
import { AppSettings } from './app.config.js';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(AppSettings.port);
}
bootstrap();
