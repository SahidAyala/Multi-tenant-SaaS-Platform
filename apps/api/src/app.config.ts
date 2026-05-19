import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.APP_PORT ?? '3000', 10),
  host: process.env.APP_HOST ?? '0.0.0.0',
  name: process.env.APP_NAME ?? 'atlas-api',
  env: process.env.NODE_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'debug',
}));

export const dbConfig = registerAs('db', () => ({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'atlas',
  password: process.env.DB_PASSWORD ?? 'atlas_dev_password',
  database: process.env.DB_DATABASE ?? 'atlas_dev',
  ssl: process.env.DB_SSL === 'true',
  poolMax: parseInt(process.env.DB_POOL_MAX ?? '20', 10),
  poolMin: parseInt(process.env.DB_POOL_MIN ?? '2', 10),
  logging: process.env.DB_LOGGING === 'true',
}));

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB ?? '0', 10),
  keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'atlas:',
}));

export const jwtConfig = registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET ?? 'insecure-dev-secret-replace-in-prod',
  expiry: process.env.JWT_EXPIRY ?? '15m',
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'insecure-refresh-secret-replace-in-prod',
  refreshExpiry: process.env.JWT_REFRESH_EXPIRY ?? '7d',
}));

export const eventBusConfig = registerAs('eventBus', () => ({
  adapter: process.env.EVENT_BUS_ADAPTER ?? 'memory',
  streamPrefix: process.env.EVENT_BUS_STREAM_PREFIX ?? 'atlas:events:',
  consumerGroup: process.env.EVENT_BUS_CONSUMER_GROUP ?? 'atlas-api',
  maxLen: parseInt(process.env.EVENT_BUS_MAX_LEN ?? '10000', 10),
}));

export const tenantConfig = registerAs('tenant', () => ({
  header: process.env.TENANT_HEADER ?? 'x-tenant-id',
  provisioningTimeoutMs: parseInt(process.env.TENANT_PROVISIONING_TIMEOUT_MS ?? '30000', 10),
}));
