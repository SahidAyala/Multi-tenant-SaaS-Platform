import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserOrmEntity } from './infrastructure/persistence/user.orm-entity';
import { UserRepository } from './infrastructure/persistence/user.repository';
import { USER_REPOSITORY } from './domain/repositories/user.repository.port';
import { JwtStrategy } from './infrastructure/jwt/jwt.strategy';
import { RegisterUserHandler } from './application/commands/register-user/register-user.handler';
import { AuthenticateHandler } from './application/commands/authenticate/authenticate.handler';
import { IdentityController } from './api/identity.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserOrmEntity]),
    PassportModule,
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
    { provide: USER_REPOSITORY, useClass: UserRepository },
    JwtStrategy,
    RegisterUserHandler,
    AuthenticateHandler,
  ],
  exports: [USER_REPOSITORY, JwtModule],
})
export class IdentityModule {}
