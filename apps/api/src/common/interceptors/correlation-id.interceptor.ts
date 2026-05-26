import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

/**
 * Ensures every response carries x-correlation-id and x-request-id headers.
 * Enables end-to-end distributed tracing across services.
 */
@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest & Record<string, unknown>>();
    const response = http.getResponse<FastifyReply>();

    const correlationId = (request.headers['x-correlation-id'] as string) ?? uuidv4();
    const requestId = uuidv4();

    request['correlationId'] = correlationId;
    request['requestId'] = requestId;

    response.header('x-correlation-id', correlationId);
    response.header('x-request-id', requestId);

    return next.handle();
  }
}
