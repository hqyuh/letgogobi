import { Inject } from '@nestjs/common';
import Redis from 'ioredis';

import { ICacheService } from './cache.interface';
import { MetadataKey } from './cache.const';

export class CacheService extends ICacheService {
  constructor(@Inject(MetadataKey.REDIS) private readonly redis: Redis) {
    super();
  }

  async set(
    key: string,
    value: string,
    expired: string | number,
  ): Promise<'OK'> {
    await this.del(key);
    return this.redis.set(key, value, 'EX', expired);
  }

  async setNx(key: string, value: string): Promise<number> {
    return this.redis.setnx(key, value);
  }

  async setNxWithExpiry(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const result = await this.redis.set(key, value, 'EX', ttlSeconds, 'NX');

    return result === 'OK';
  }

  get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  del(key: string) {
    return this.redis.del(key);
  }

  keys(prefix: string): Promise<string[]> {
    return this.redis.keys(`${prefix}:*`);
  }
}
