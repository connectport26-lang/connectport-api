import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Fail closed in production: missing payment/mail/image/Redis config
 * must not silently degrade into demo or disk paths.
 */
export function assertProductionConfig(config: ConfigService) {
  const logger = new Logger('ProdGuard');
  const env = config.get<string>('NODE_ENV') ?? 'development';
  if (env !== 'production') {
    logger.log(`Skipping production config checks (NODE_ENV=${env})`);
    return;
  }

  const missing: string[] = [];
  const require = (key: string) => {
    if (!config.get<string>(key)?.trim()) missing.push(key);
  };

  require('JWT_SECRET');
  require('DATABASE_URL');
  require('CORS_ORIGIN');
  require('APP_URL');
  require('RESEND_API_KEY');
  require('MAIL_FROM');
  require('PAYSTACK_SECRET_KEY');
  require('R2_ACCESS_KEY_ID');
  require('R2_SECRET_ACCESS_KEY');
  require('R2_BUCKET');
  require('R2_ENDPOINT');
  require('R2_PUBLIC_BASE_URL');
  require('REDIS_URL');

  if (missing.length) {
    throw new Error(
      `Production config incomplete. Set: ${missing.join(', ')}`,
    );
  }

  const jwt = config.getOrThrow<string>('JWT_SECRET');
  if (jwt.length < 32 || jwt.includes('change-me')) {
    throw new Error('JWT_SECRET must be a strong secret (32+ chars) in production.');
  }

  logger.log('Production config checks passed');
}

export function isProduction(config: ConfigService) {
  return (config.get<string>('NODE_ENV') ?? 'development') === 'production';
}
