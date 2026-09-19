import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { randomUUID } from 'crypto';

/**
 * Structured request logging + simple in-process counters for ops dashboards.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  private readonly counters = new Map<string, number>();

  bump(key: string, by = 1) {
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
  }

  snapshot() {
    return Object.fromEntries(this.counters.entries());
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: { sub?: string } }>();
    const res = http.getResponse<Response>();
    const started = Date.now();
    const requestId =
      (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    res.setHeader('x-request-id', requestId);

    const route = `${req.method} ${req.route?.path ?? req.path}`;
    const safePath = (req.route?.path ?? req.path ?? '').split('?')[0];

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - started;
          this.bump(`http.${req.method}.${res.statusCode}`);
          if (route.includes('auth')) this.bump('auth.ok');
          if (route.includes('payments') || route.includes('webhooks')) {
            this.bump('payments.hit');
          }
          this.logger.log(
            JSON.stringify({
              requestId,
              userId: req.user?.sub ?? null,
              method: req.method,
              path: safePath,
              status: res.statusCode,
              ms,
            }),
          );
        },
        error: () => {
          const ms = Date.now() - started;
          this.bump(`http.${req.method}.err`);
          if (route.includes('auth')) this.bump('auth.fail');
          this.logger.warn(
            JSON.stringify({
              requestId,
              userId: req.user?.sub ?? null,
              method: req.method,
              path: safePath,
              status: res.statusCode || 500,
              ms,
              err: true,
            }),
          );
        },
      }),
    );
  }
}
