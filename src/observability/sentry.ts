import { Logger } from '@nestjs/common';

/**
 * Optional Sentry bootstrap. Set SENTRY_DSN to enable.
 * Keeps the dependency optional so local/dev works without @sentry/node.
 */
export function initSentry() {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  const logger = new Logger('Sentry');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/node') as {
      init: (opts: Record<string, unknown>) => void;
    };
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
      sendDefaultPii: false,
      beforeSend(event: {
        request?: { headers?: Record<string, string>; cookies?: unknown };
      }) {
        if (event.request?.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
          delete event.request.headers.Cookie;
        }
        if (event.request) {
          delete event.request.cookies;
        }
        return event;
      },
    });
    logger.log('Sentry initialized');
  } catch {
    logger.warn(
      'SENTRY_DSN set but @sentry/node is not installed. npm i @sentry/node to enable.',
    );
  }
}
