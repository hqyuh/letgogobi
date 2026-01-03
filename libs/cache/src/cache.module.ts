import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';

import { ICacheService } from './cache.interface';
import { CacheService } from './cache.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MetadataKey } from './cache.const';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: MetadataKey.REDIS,
      inject: [ConfigService],
      useFactory(config: ConfigService): Redis {
        const redisConfig = {
          username: config.getOrThrow<string>('REDIS_USERNAME'),
          password: config.getOrThrow<string>('REDIS_PASSWORD'),
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
          keyPrefix: config.getOrThrow<string>('REDIS_PREFIX'),
        };

        return new Redis({
          host: redisConfig.host,
          port: redisConfig.port,
          username: redisConfig.username,
          password: redisConfig.password,
          keyPrefix: redisConfig.keyPrefix,
        });
      },
    },
    {
      provide: ICacheService,
      useClass: CacheService,
    },
  ],
  exports: [ICacheService],
})
export class CacheModule {}
