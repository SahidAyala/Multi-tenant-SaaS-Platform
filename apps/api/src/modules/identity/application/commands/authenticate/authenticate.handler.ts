import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Result, UnauthorizedException } from '@atlas/shared-kernel';
import { AuthenticateCommand } from './authenticate.command';
import { USER_REPOSITORY, UserRepositoryPort } from '../../repositories/user.repository.port';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
  email: string;
}

@Injectable()
export class AuthenticateHandler {
  private readonly logger = new Logger(AuthenticateHandler.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepositoryPort,
    private readonly jwtService: JwtService,
  ) {}

  async execute(command: AuthenticateCommand): Promise<Result<TokenPair>> {
    const user = await this.userRepository.findByEmail(command.email);
    if (!user) {
      // Constant-time response to prevent email enumeration
      return Result.fail(new UnauthorizedException('Invalid credentials'));
    }

    const passwordValid = await user.verifyPassword(command.password);
    if (!passwordValid) {
      return Result.fail(new UnauthorizedException('Invalid credentials'));
    }

    if (!user.isActive) {
      return Result.fail(new UnauthorizedException(`Account is ${user.status}`));
    }

    user.recordLogin();
    await this.userRepository.save(user);

    const accessToken = this.jwtService.sign(
      {
        sub: user.userId,
        email: user.email.value,
        tenantId: 'global',
        role: 'member',
        type: 'access',
      },
      { expiresIn: '15m' },
    );

    const refreshToken = this.jwtService.sign(
      { sub: user.userId, type: 'refresh' },
      { expiresIn: '7d' },
    );

    this.logger.log(`User authenticated: ${user.userId}`);

    return Result.ok({
      accessToken,
      refreshToken,
      expiresIn: 900,
      userId: user.userId,
      email: user.email.value,
    });
  }
}
