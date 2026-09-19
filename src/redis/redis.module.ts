import { Global, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis | null;
  private readonly memory = new Map<string, { value: string; expiresAt?: number }>();

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL')?.trim();
    if (url) {
      this.client = new Redis(url, {
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
        lazyConnect: false,
      });
      this.client.on('error', (err) => {
        this.logger.error(`Redis error: ${err.message}`);
      });
      this.logger.log('Redis connected');
    } else {
      this.client = null;
      this.logger.warn('REDIS_URL unset — using in-memory cache (not for multi-instance prod)');
    }
  }

  get isRedis() {
    return Boolean(this.client);
  }

  async ping(): Promise<boolean> {
    if (!this.client) return true;
    const pong = await this.client.ping();
    return pong === 'PONG';
  }

  async get(key: string): Promise<string | null> {
    if (this.client) return this.client.get(key);
    const row = this.memory.get(key);
    if (!row) return null;
    if (row.expiresAt && row.expiresAt < Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return row.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.client) {
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
      return;
    }
    this.memory.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async del(key: string): Promise<void> {
    if (this.client) {
      await this.client.del(key);
      return;
    }
    this.memory.delete(key);
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    if (this.client) {
      const n = await this.client.incr(key);
      if (n === 1 && ttlSeconds) await this.client.expire(key, ttlSeconds);
      return n;
    }
    const current = Number((await this.get(key)) ?? '0') + 1;
    await this.set(key, String(current), ttlSeconds);
    return current;
  }

  async listPush(key: string, value: string): Promise<void> {
    if (this.client) {
      await this.client.rpush(key, value);
      return;
    }
    const existing = this.memory.get(key);
    const list: string[] = existing ? JSON.parse(existing.value) : [];
    list.push(value);
    this.memory.set(key, { value: JSON.stringify(list) });
  }

  async listPop(key: string): Promise<string | null> {
    if (this.client) {
      return this.client.lpop(key);
    }
    const existing = this.memory.get(key);
    if (!existing) return null;
    const list: string[] = JSON.parse(existing.value);
    const value = list.shift() ?? null;
    if (list.length) this.memory.set(key, { value: JSON.stringify(list) });
    else this.memory.delete(key);
    return value;
  }

  async onModuleDestroy() {
    if (this.client) await this.client.quit();
  }
}

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
