import { CONSUMER_SERVICE } from '@libs/kafka/lib/constants/kafka.const';
import { IConsumerService } from '@libs/kafka/lib/services/comsumer/consumer.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OutboxEvent } from 'generated/prisma/client';
import { KafkaMessage } from 'kafkajs';
import { DebeziumCdcEvent } from './types/debezium.types';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(CONSUMER_SERVICE) private readonly consumer: IConsumerService,
  ) {}

  public handleSendNotification(): void {
    this.consumer.consume(async (message: KafkaMessage): Promise<void> => {
      try {
        const messageValue = message.value?.toString();
        const parsedMessage = JSON.parse(messageValue);

        // Debezium can wrap in "payload" or send directly
        const cdcEvent: DebeziumCdcEvent<OutboxEvent> =
          parsedMessage.payload || parsedMessage;

        // Debezium CDC event structure: { before, after, source, op, ts_ms }
        // op: 'c' = create, 'u' = update, 'd' = delete
        // Note: Debezium sends database column names (snake_case), not Prisma model names (camelCase)
        if (cdcEvent.op === 'c' && cdcEvent.after) {
          // Extract payload from outbox_event
          // Debezium uses database column names: aggregate_type, aggregate_id, etc.
          const outboxEvent = cdcEvent.after;
          let payload: OutboxEvent['payload'];

          try {
            payload = JSON.parse(
              outboxEvent.payload as string,
            ) as OutboxEvent['payload'];
          } catch (parseError) {
            this.logger.warn(
              'Failed to parse outbox event payload:',
              parseError,
            );
            payload = { raw: outboxEvent.payload } as OutboxEvent['payload'];
          }

          this.logger.log('Received Debezium CDC event:', {
            operation: cdcEvent.op,
            status: outboxEvent.status,
            payload,
            timestamp: new Date(cdcEvent.ts_ms).toISOString(),
          });
        }
      } catch (error) {
        this.logger.error('Error when processing message:', error);
      }
    });
  }
}
