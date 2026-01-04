import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, of, throwError } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';
import { ICacheService } from '@libs/cache/cache.interface';

enum EIdempotencyStatus {
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly cacheService: ICacheService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const key = req.headers['idempotency-key'];

    if (!key) {
      return next.handle();
    }

    const cacheKey = `idempotency:${key}`;
    const lockKey = `idempotency-lock:${key}`;

    // 1. Check cache first
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // If status is PROCESSING, return 409 Conflict with Retry-After header
        if (parsed.status === EIdempotencyStatus.PROCESSING) {
          res.setHeader('Retry-After', '1');
          throw new ConflictException(
            'Request with this idempotency-key is already being processed',
          );
        }
        // If status is COMPLETED, return cached data with 201 Created status
        if (parsed.status === EIdempotencyStatus.COMPLETED) {
          res.status(HttpStatus.CREATED);
          return of(parsed.data);
        }
        return of(parsed);
      } catch (error) {
        if (error instanceof ConflictException) {
          throw error;
        }
        // If parse fails, delete cache and continue
        await this.cacheService.del(cacheKey);
      }
    }

    // 2. Try to acquire lock
    const lockAcquired = await this.cacheService.setNxWithExpiry(
      lockKey,
      '1',
      60, // Lock expires in 60s (longer than max processing time)
    );

    if (!lockAcquired) {
      // Another request is processing - check cache again for PROCESSING status
      const processingCheck = await this.cacheService.get(cacheKey);
      if (processingCheck) {
        try {
          const parsed = JSON.parse(processingCheck);
          if (parsed.status === EIdempotencyStatus.PROCESSING) {
            res.setHeader('Retry-After', '1');
            throw new ConflictException(
              'Request with this idempotency-key is already being processed',
            );
          }
        } catch (error) {
          if (error instanceof ConflictException) {
            throw error;
          }
        }
      }
      // Lock exists but no PROCESSING status - another request just started
      res.setHeader('Retry-After', '1');
      throw new ConflictException(
        'Request with this idempotency-key is already being processed',
      );
    }

    // 3. Lock acquired - mark as PROCESSING immediately
    await this.cacheService.set(
      cacheKey,
      JSON.stringify({ status: EIdempotencyStatus.PROCESSING }),
      60, // Same TTL as lock
    );

    return next.handle().pipe(
      tap(async (response) => {
        try {
          // Save completed result (overwrite PROCESSING status)
          await this.cacheService.set(
            cacheKey,
            JSON.stringify({
              status: EIdempotencyStatus.COMPLETED,
              data: response,
            }),
            86400, // 24 hours TTL for completed results
          );
        } catch (e) {
          console.error('Failed to cache idempotency response', e);
        }
      }),
      catchError(async (error) => {
        // On error, cleanup PROCESSING status to allow retry
        try {
          await this.cacheService.del(cacheKey);
        } catch (e) {
          console.error('Failed to cleanup idempotency cache on error', e);
        }
        return throwError(() => error);
      }),
      finalize(async () => {
        // Release lock after processing completes (success or error)
        await this.cacheService.del(lockKey);
      }),
    );
  }
}
