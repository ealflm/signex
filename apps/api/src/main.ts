import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableShutdownHooks();

  // CORS — share the same allow-list as OriginGuard (AUTH_ALLOWED_ORIGINS).
  // In dev, if the env var is unset, reflect every origin (true) so local
  // `npm run dev` works without extra config.
  const corsOrigins = (process.env.AUTH_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length ? corsOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-preview-secret',
      'x-revalidate-secret',
    ],
  });

  const port = process.env.API_PORT ?? 3060;
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
