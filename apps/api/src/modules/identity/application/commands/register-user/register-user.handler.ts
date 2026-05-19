import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConflictException, Result } from '@atlas/shared-kernel';
import { USER_REGISTERED, UserRegisteredEvent } from '@atlas/event-contracts';
import { RegisterUserCommand } from './register-user.command';
import { USER_REPOSITORY, UserRepositoryPort } from '../../repositories/user.repository.port';
import { UserAggregate } from '../../aggregates/user.aggregate';
import { EVENT_BUS_PORT, IEventBus } from '../../../../platform-events/ports/event-bus.port';

export interface RegisterUserResult {
  userId: string;
  email: string;
  displayName: string;
}

@Injectable()
export class RegisterUserHandler {
  private readonly logger = new Logger(RegisterUserHandler.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepositoryPort,
    @Inject(EVENT_BUS_PORT)
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: RegisterUserCommand): Promise<Result<RegisterUserResult>> {
    const exists = await this.userRepository.existsByEmail(command.email);
    if (exists) {
      return Result.fail(new ConflictException(`User with email '${command.email}' already exists`));
    }

    const user = await UserAggregate.create({
      email: command.email,
      password: command.password,
      displayName: command.displayName,
    });

    const saved = await this.userRepository.save(user);

    const event: UserRegisteredEvent = {
      eventId: saved.userId,
      eventType: USER_REGISTERED,
      tenantId: 'global',
      correlationId: command.correlationId,
      occurredAt: new Date().toISOString(),
      version: 1,
      payload: {
        userId: saved.userId,
        email: saved.email.value,
        displayName: saved.displayName,
        registeredAt: new Date().toISOString(),
      },
    };

    await this.eventBus.publish(event);
    this.logger.log(`User registered: ${saved.userId} (${saved.email.value})`);

    return Result.ok({
      userId: saved.userId,
      email: saved.email.value,
      displayName: saved.displayName,
    });
  }
}
