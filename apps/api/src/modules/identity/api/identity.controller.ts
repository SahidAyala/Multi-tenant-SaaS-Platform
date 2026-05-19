import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, MinLength } from 'class-validator';
import { Public } from '../../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RegisterUserHandler } from '../application/commands/register-user/register-user.handler';
import { AuthenticateHandler } from '../application/commands/authenticate/authenticate.handler';
import { RegisterUserCommand } from '../application/commands/register-user/register-user.command';
import { AuthenticateCommand } from '../application/commands/authenticate/authenticate.command';

class RegisterBody {
  @IsEmail()
  email!: string;

  @MinLength(8)
  password!: string;

  @IsNotEmpty()
  @IsString()
  @Length(2, 100)
  displayName!: string;
}

class LoginBody {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  password!: string;

  @IsOptional()
  @IsString()
  organizationSlug?: string;
}

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class IdentityController {
  constructor(
    private readonly registerUserHandler: RegisterUserHandler,
    private readonly authenticateHandler: AuthenticateHandler,
  ) {}

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: RegisterBody) {
    const command = new RegisterUserCommand({
      email: body.email,
      password: body.password,
      displayName: body.displayName,
    });
    const result = await this.registerUserHandler.execute(command);
    if (!result.success) throw result.error;
    return result.value;
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginBody) {
    const command = new AuthenticateCommand({
      email: body.email,
      password: body.password,
      organizationSlug: body.organizationSlug,
    });
    const result = await this.authenticateHandler.execute(command);
    if (!result.success) throw result.error;
    return result.value;
  }
}
