import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserOrmEntity } from './infrastructure/persistence/user.orm-entity';
import { UserRepository } from './infrastructure/persistence/user.repository';
import { UserRepositoryPort } from './domain/repositories/user.repository.port';
import { JwtStrategy } from './infrastructure/jwt/jwt.strategy';
import { RegisterUserHandler } from './application/commands/register-user/register-user.handler';
import { AuthenticateHandler } from './application/commands/authenticate/authenticate.handler';
import { IdentityController } from './api/identity.controller';
import { TenantCoreModule } from '../tenant-core/tenant-core.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserOrmEntity]),
    PassportModule,
    // AuthenticateHandler resolves the user's tenant via OrganizationRepositoryPort
    // at login time — TenantCoreModule exports the port.
    TenantCoreModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: { expiresIn: configService.get<string>('jwt.expiry', '15m') },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [IdentityController],
  providers: [
    { provide: UserRepositoryPort, useClass: UserRepository },
    JwtStrategy,
    RegisterUserHandler,
    AuthenticateHandler,
  ],
  exports: [UserRepositoryPort, JwtModule],
})
export class IdentityModule {}
