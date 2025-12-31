import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from 'generated/prisma/client';
import { env } from 'prisma/config';

type Env = {
  DATABASE_URL: string;
};

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  constructor() {
    const pool = new PrismaPg({
      connectionString: env<Env>('DATABASE_URL'),
    });
    super({
      adapter: pool,
      log: [
        {
          emit: 'event',
          level: 'query',
        },
        {
          emit: 'stdout',
          level: 'error',
        },
        {
          emit: 'stdout',
          level: 'info',
        },
        {
          emit: 'stdout',
          level: 'warn',
        },
      ],
    });
    this.$on('query' as never, (e: Prisma.QueryEvent) => {
      this.logger.debug(`Query: ${e.query}`, e.params);
      this.logger.debug(`Duration: ${e.duration}ms`);
      this.logger.debug(`Target: ${e.target}`);
    });
  }
  async onModuleInit() {
    this.logger.log('Connecting to database...');
    await this.$connect();
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting from database...');
    await this.$disconnect();
  }
}
