import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableShutdownHooks();
  const port = process.env.API_PORT ?? 3060;
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
