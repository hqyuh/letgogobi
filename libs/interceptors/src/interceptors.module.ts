import { Module } from '@nestjs/common';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { CacheModule } from '@libs/cache/cache.module';

@Module({
  imports: [CacheModule],
  providers: [IdempotencyInterceptor],
  exports: [IdempotencyInterceptor],
})
export class InterceptorsModule {}
