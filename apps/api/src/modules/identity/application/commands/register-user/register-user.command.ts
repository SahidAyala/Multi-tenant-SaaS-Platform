import { Command } from '@atlas/shared-kernel';
import { IsEmail, IsNotEmpty, IsString, Length, MinLength } from 'class-validator';

export class RegisterUserCommand extends Command {
  @IsEmail()
  readonly email: string;

  @MinLength(8)
  readonly password: string;

  @IsNotEmpty()
  @IsString()
  @Length(2, 100)
  readonly displayName: string;

  constructor(params: {
    email: string;
    password: string;
    displayName: string;
    correlationId?: string;
  }) {
    super({ tenantId: 'global', correlationId: params.correlationId });
    this.email = params.email;
    this.password = params.password;
    this.displayName = params.displayName;
  }
}
