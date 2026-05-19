import { Command } from '@atlas/shared-kernel';

export class AuthenticateCommand extends Command {
  readonly email: string;
  readonly password: string;
  readonly organizationSlug?: string;

  constructor(params: {
    email: string;
    password: string;
    organizationSlug?: string;
    correlationId?: string;
  }) {
    super({ tenantId: 'global', correlationId: params.correlationId });
    this.email = params.email;
    this.password = params.password;
    this.organizationSlug = params.organizationSlug;
  }
}
