import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { isProduction } from '../common/prod-guard';

type UploadFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

type SniffedImage = {
  mime: string;
  ext: string;
};

function sniffImage(buffer: Buffer): SniffedImage | null {
  if (buffer.length < 12) return null;
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: '.jpg' };
  }
  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { mime: 'image/png', ext: '.png' };
  }
  // GIF
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return { mime: 'image/gif', ext: '.gif' };
  }
  // WEBP (RIFF....WEBP)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: '.webp' };
  }
  return null;
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private client: S3Client | null = null;

  constructor(private readonly config: ConfigService) {}

  async storeImage(file: UploadFile): Promise<{ url: string }> {
    const sniffed = sniffImage(file.buffer);
    if (!sniffed) {
      throw new Error(
        'File is not a valid JPEG, PNG, WebP, or GIF image.',
      );
    }

    if (this.isR2Configured()) {
      return this.uploadToR2(file, sniffed);
    }

    if (isProduction(this.config)) {
      throw new ServiceUnavailableException(
        'Image uploads are unavailable. Cloudflare R2 is not configured.',
      );
    }

    return this.saveToDisk(file, sniffed);
  }

  private isR2Configured() {
    return Boolean(
      this.config.get<string>('R2_ACCESS_KEY_ID')?.trim() &&
        this.config.get<string>('R2_SECRET_ACCESS_KEY')?.trim() &&
        this.config.get<string>('R2_BUCKET')?.trim() &&
        this.config.get<string>('R2_ENDPOINT')?.trim() &&
        this.config.get<string>('R2_PUBLIC_BASE_URL')?.trim(),
    );
  }

  private getS3(): S3Client {
    if (this.client) return this.client;
    const endpoint = this.config.getOrThrow<string>('R2_ENDPOINT').trim();
    const accessKeyId = this.config
      .getOrThrow<string>('R2_ACCESS_KEY_ID')
      .trim();
    const secretAccessKey = this.config
      .getOrThrow<string>('R2_SECRET_ACCESS_KEY')
      .trim();

    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: false,
    });
    return this.client;
  }

  private async uploadToR2(
    file: UploadFile,
    sniffed: SniffedImage,
  ): Promise<{ url: string }> {
    const bucket = this.config.getOrThrow<string>('R2_BUCKET').trim();
    const publicBase = this.config
      .getOrThrow<string>('R2_PUBLIC_BASE_URL')
      .trim()
      .replace(/\/$/, '');

    const key = `requests/${randomUUID()}${sniffed.ext}`;

    try {
      await this.getS3().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: file.buffer,
          ContentType: sniffed.mime,
          ContentDisposition: 'inline',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Cloudflare R2 upload failed.';
      this.logger.error(message);
      throw new Error(message);
    }

    return { url: `${publicBase}/${key}` };
  }

  private async saveToDisk(
    file: UploadFile,
    sniffed: SniffedImage,
  ): Promise<{ url: string }> {
    const dir = join(process.cwd(), 'uploads');
    await mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}${sniffed.ext}`;
    const path = join(dir, filename);
    await pipeline(Readable.from(file.buffer), createWriteStream(path));
    this.logger.debug(`Saved upload to disk: ${filename}`);
    return { url: `/uploads/${filename}` };
  }
}
