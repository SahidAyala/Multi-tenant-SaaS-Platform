import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';

import {
  appConfig,
  dbConfig,
  eventBusConfig,
  jwtConfig,
  redisConfig,
  tenantConfig,
} from './app.config';

import { TenantContextModule } from './common/tenant-context/tenant-context.module';
import { TenantContextMiddleware } from './common/tenant-context/tenant-context.middleware';

import { PlatformEventsModule } from './modules/platform-events/platform-events.module';
import { TenantCoreModule } from './modules/tenant-core/tenant-core.module';
import { IdentityModule } from './modules/identity/identity.module';
import { AuditModule } from './modules/audit/audit.module';
import { WorkflowModule } from './modules/workflow/workflow.module';

import { OrganizationOrmEntity } from './modules/tenant-core/infrastructure/persistence/organization.orm-entity';
import { UserOrmEntity } from './modules/identity/infrastructure/persistence/user.orm-entity';
import { AuditEventOrmEntity } from './modules/audit/infrastructure/persistence/audit-event.orm-entity';
import { WorkflowDefinitionOrmEntity } from './modules/workflow/infrastructure/persistence/workflow-definition.orm-entity';
import { WorkflowExecutionOrmEntity } from './modules/workflow/infrastructure/persistence/workflow-execution.orm-entity';

@Module({
  imports: [
    // -- Configuration --
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, dbConfig, redisConfig, jwtConfig, eventBusConfig, tenantConfig],
      envFilePath: ['.env', '.env.local'],
    }),

    // -- Rate Limiting --
    ThrottlerModule.forRootAsync({
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get('THROTTLE_TTL', 60000),
          limit: configService.get('THROTTLE_LIMIT', 100),
        },
      ],
      inject: [ConfigService],
    }),

    // -- Database --
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('db.host'),
        port: configService.get('db.port'),
        username: configService.get('db.username'),
        password: configService.get('db.password'),
        database: configService.get('db.database'),
        ssl: configService.get('db.ssl') ? { rejectUnauthorized: false } : false,
        entities: [
          OrganizationOrmEntity,
          UserOrmEntity,
          AuditEventOrmEntity,
          WorkflowDefinitionOrmEntity,
          WorkflowExecutionOrmEntity,
        ],
        synchronize: false,
        logging: configService.get('db.logging'),
        poolSize: configService.get('db.poolMax'),
      }),
      inject: [ConfigService],
    }),

    // -- Cross-cutting modules (global) --
    TenantContextModule,
    PlatformEventsModule.forRoot(),

    // -- Domain modules --
    TenantCoreModule,
    IdentityModule,
    AuditModule,
    WorkflowModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantContextMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
