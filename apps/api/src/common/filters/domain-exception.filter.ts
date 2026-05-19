import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import {
  DomainException,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  ValidationException,
} from '@atlas/shared-kernel';

interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  correlationId?: string;
  violations?: Record<string, string[]>;
}

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: DomainException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<Record<string, unknown>>();

    const statusCode = this.resolveHttpStatus(exception);
    const correlationId = request['correlationId'] as string | undefined;

    if (statusCode >= 500) {
      this.logger.error(`Domain exception: ${exception.message}`, exception.stack, {
        correlationId,
        code: exception.code,
      });
    }

    const body: ErrorResponse = {
      statusCode,
      code: exception.code,
      message: exception.message,
      correlationId,
    };

    if (exception instanceof ValidationException) {
      body.violations = exception.violations;
    }

    response.status(statusCode).send(body);
  }

  private resolveHttpStatus(exception: DomainException): number {
    if (exception instanceof NotFoundException) return HttpStatus.NOT_FOUND;
    if (exception instanceof ConflictException) return HttpStatus.CONFLICT;
    if (exception instanceof UnauthorizedException) return HttpStatus.UNAUTHORIZED;
    if (exception instanceof ForbiddenException) return HttpStatus.FORBIDDEN;
    if (exception instanceof ValidationException) return HttpStatus.UNPROCESSABLE_ENTITY;
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
