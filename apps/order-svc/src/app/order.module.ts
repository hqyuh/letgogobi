import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { KafkaModule } from '@libs/kafka/lib/kafka.module';
import { PrismaModule } from '@libs/prisma/lib/prisma.module';
import { CacheModule } from '@libs/cache/cache.module';
import { Partitioners } from 'kafkajs';

@Module({
  imports: [
    KafkaModule.register({
      name: 'ORDER_SVC',
      topics: [],
      options: {
        client: {
          clientId: 'order-service-kafka-client',
          brokers: ['localhost:9094'],
          retry: {
            retries: 5,
            initialRetryTime: 300,
          },
        },
        producer: {
          allowAutoTopicCreation: true,
          // createPartitioner: KafkaService.CustomPartitioner,
          createPartitioner: Partitioners.LegacyPartitioner,
          transactionalId: 'order-service-tx-producer',
          maxInFlightRequests: 1,
          idempotent: true,
        },
        consumer: {
          groupId: 'order-service-consumer-group',
          allowAutoTopicCreation: true,
          sessionTimeout: 30000,
          heartbeatInterval: 3000,
          readUncommitted: false,
        },
        consumeFromBeginning: false,
        autoConnect: true,
      },
    }),
    PrismaModule,
    CacheModule,
  ],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}
