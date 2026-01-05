import { Module } from '@nestjs/common';
import { Partitioners } from 'kafkajs';
import { KafkaModule } from '@libs/kafka/lib/kafka.module';
import { NotificationConsumer } from './notification.consumer';
import { NotificationService } from './notification.service';
import { PrismaModule } from '@libs/prisma/lib/prisma.module';

@Module({
  imports: [
    KafkaModule.register({
      name: 'NOTIFICATION_SERVICE_KAFKA',
      topics: ['order-svc.created.public.outbox_event'],
      options: {
        client: {
          clientId: 'notification-service-kafka-client',
          brokers: ['localhost:9094'],
        },
        producer: {
          allowAutoTopicCreation: true,
          createPartitioner: Partitioners.LegacyPartitioner,
          transactionalId: 'notification-service-tx-producer',
          maxInFlightRequests: 1,
          idempotent: true,
        },
        consumer: {
          groupId: 'notification-service-consumer-group',
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
  ],
  controllers: [NotificationConsumer],
  providers: [NotificationService],
})
export class NotificationServiceModule {}
