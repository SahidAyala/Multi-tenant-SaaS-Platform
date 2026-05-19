import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Standalone DataSource for TypeORM CLI migrations.
 * Not used by the NestJS app (which uses TypeOrmModule.forRootAsync).
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'atlas',
  password: process.env.DB_PASSWORD ?? 'atlas_dev_password',
  database: process.env.DB_DATABASE ?? 'atlas_dev',
  entities: ['apps/api/src/**/infrastructure/persistence/*.orm-entity.ts'],
  migrations: ['database/migrations/*.ts'],
  migrationsTableName: 'atlas_migrations',
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
});
