import { CONSUMER_SERVICE } from '@libs/kafka/lib/constants/kafka.const';
import { decodeKafkaMessageValue } from '@libs/kafka/lib/utils/kafka-message-decoder';
import { IConsumerService } from '@libs/kafka/lib/services/comsumer/consumer.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OutboxEvent } from 'generated/prisma/client';
import { KafkaMessage } from 'kafkajs';
import { DebeziumUnwrappedOutboxEvent } from './types/debezium.types';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(CONSUMER_SERVICE) private readonly consumer: IConsumerService,
  ) {}

  public handleSendNotification(): void {
    this.consumer.consume(async (message: KafkaMessage): Promise<void> => {
      try {
        const outboxEvent =
          await decodeKafkaMessageValue<DebeziumUnwrappedOutboxEvent>(
            message.value,
          );
        console.info('Decoded outbox event:', outboxEvent);
        if (!outboxEvent) {
          return;
        }

        if (outboxEvent.__op !== 'c') {
          return;
        }

        let payload: OutboxEvent['payload'];

        try {
          payload = JSON.parse(
            outboxEvent.event_payload,
          ) as OutboxEvent['payload'];
        } catch (parseError) {
          this.logger.warn('Failed to parse outbox event_payload:', parseError);
          payload = {
            raw: outboxEvent.event_payload,
          } as OutboxEvent['payload'];
        }

        this.logger.log('Received Debezium CDC event:', {
          operation: outboxEvent.__op,
          aggregate_type: outboxEvent.aggregate_type,
          aggregate_id: outboxEvent.aggregate_id,
          status: outboxEvent.status,
          payload,
          timestamp: new Date(outboxEvent.__ts_ms).toISOString(),
        });
      } catch (error) {
        this.logger.error('Error when processing message:', error);
      }
    });
  }
}
