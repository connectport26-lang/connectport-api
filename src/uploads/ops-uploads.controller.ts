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
import { RequireOps } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { RedisService } from '../redis/redis.module';
import { UploadsService } from './uploads.service';

const allowedTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

const IMAGE_MAX = 2 * 1024 * 1024;
const VIDEO_MAX = 25 * 1024 * 1024;
const DAILY_UPLOAD_CAP = 80;

@Controller('ops/product-uploads')
@RequireOps()
export class OpsUploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly redis: RedisService,
  ) {}

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: VIDEO_MAX },
      fileFilter: (_request, file, callback) => {
        const type = (file.mimetype || '').toLowerCase();
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
      throw new BadRequestException(
        'Upload a JPEG, PNG, WebP, GIF, MP4, or WebM (images under 2 MB, video under 25 MB).',
      );
    }

    const type = (file.mimetype || '').toLowerCase();
    const isVideo = type.startsWith('video/');
    if (!isVideo && file.buffer.length > IMAGE_MAX) {
      throw new BadRequestException('Images must be under 2 MB.');
    }
    if (isVideo && file.buffer.length > VIDEO_MAX) {
      throw new BadRequestException('Videos must be under 25 MB.');
    }

    const day = new Date().toISOString().slice(0, 10);
    const key = `cp:ops-uploads:daily:${user.sub}:${day}`;
    const current = Number((await this.redis.get(key)) ?? '0');
    if (current >= DAILY_UPLOAD_CAP) {
      throw new BadRequestException(
        'Daily upload limit reached. Try again tomorrow.',
      );
    }

    try {
      // Reuse find media storage (images + video sniff); store under products via request media path
      const result = await this.uploads.storeProductMedia(file);
      await this.redis.incr(key, 60 * 60 * 24);
      return result;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        err instanceof Error
          ? err.message
          : 'Could not store that file. Try JPEG, PNG, or MP4 under the size limit.',
      );
    }
  }
}
