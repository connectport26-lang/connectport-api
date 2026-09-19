import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

/**
 * Cloudflare Turnstile verification (env-gated).
 * When TURNSTILE_SECRET_KEY is unset, captcha checks are skipped.
 */
@Injectable()
export class CaptchaService {
  constructor(private readonly config: ConfigService) {}

  isEnabled() {
    return Boolean(this.config.get<string>('TURNSTILE_SECRET_KEY')?.trim());
  }

  async assertValid(token: string | undefined, remoteIp?: string) {
    if (!this.isEnabled()) return;
    if (!token?.trim()) {
      throw new BadRequestException('Captcha required.');
    }
    const secret = this.config.getOrThrow<string>('TURNSTILE_SECRET_KEY').trim();
    const body = new URLSearchParams({
      secret,
      response: token.trim(),
    });
    if (remoteIp) body.set('remoteip', remoteIp);

    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body },
    );
    const json = (await res.json()) as { success?: boolean };
    if (!json.success) {
      throw new UnauthorizedException('Captcha verification failed.');
    }
  }

  /** Opaque fingerprint for logging without storing tokens. */
  tokenFingerprint(token: string) {
    return createHash('sha256').update(token).digest('hex').slice(0, 12);
  }
}
