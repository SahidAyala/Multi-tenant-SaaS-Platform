import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { CorrelationIdInterceptor } from './common/interceptors/correlation-id.interceptor';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false, // Use NestJS logger instead
      trustProxy: true,
    }),
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3000);
  const host = configService.get<string>('app.host', '0.0.0.0');
  const env = configService.get<string>('app.env', 'development');

  // -- API Versioning --
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // -- Global Validation --
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // -- Global Exception Handling --
  app.useGlobalFilters(new DomainExceptionFilter());

  // -- Global Interceptors --
  app.useGlobalInterceptors(new CorrelationIdInterceptor());

  // -- CORS (tighten in production) --
  if (env !== 'production') {
    app.enableCors({
      origin: true,
      credentials: true,
    });
  }

  // -- Health check endpoint (before auth) --
  app.getHttpAdapter().get('/health', (_req, reply) => {
    void reply.status(200).send({ status: 'ok', version: process.env.APP_VERSION ?? '0.1.0' });
  });

  await app.listen(port, host);
  logger.log(`ATLAS API running on ${host}:${port} [${env}]`);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
