import { Throttle } from '@nestjs/throttler';
import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RequireRequester } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { RedisService } from '../redis/redis.module';
import { UploadsService } from './uploads.service';

const allowedTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const DAILY_UPLOAD_CAP = 40;

@Controller('me/request-uploads')
@RequireRequester()
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly redis: RedisService,
  ) {}

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        const type = (file.mimetype || '').toLowerCase();
        const name = (file.originalname || '').toLowerCase();
        if (
          type.includes('heic') ||
          type.includes('heif') ||
          name.endsWith('.heic') ||
          name.endsWith('.heif')
        ) {
          callback(null, false);
          return;
        }
        callback(null, allowedTypes.has(type));
      },
    }),
  )
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile()
    file?: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
    },
  ) {
    if (!file?.buffer?.length) {
      const name = file?.originalname?.toLowerCase() ?? '';
      if (name.endsWith('.heic') || name.endsWith('.heif')) {
        throw new BadRequestException(
          'HEIC photos are not supported. Convert to JPEG or PNG and try again.',
        );
      }
      throw new BadRequestException(
        'Upload a JPEG, PNG, WebP, or GIF under 2 MB.',
      );
    }

    const day = new Date().toISOString().slice(0, 10);
    const key = `cp:uploads:daily:${user.sub}:${day}`;
    const current = Number((await this.redis.get(key)) ?? '0');
    if (current >= DAILY_UPLOAD_CAP) {
      throw new BadRequestException(
        'Daily upload limit reached. Try again tomorrow.',
      );
    }

    try {
      const result = await this.uploads.storeImage(file);
      await this.redis.incr(key, 60 * 60 * 24);
      return result;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        err instanceof Error
          ? err.message
          : 'Could not store that image. Try JPEG or PNG under 2 MB.',
      );
    }
  }
}
