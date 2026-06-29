import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  Consumer,
  EachBatchPayload,
  EachMessagePayload,
  Kafka,
  KafkaMessage,
  TopicPartitionOffset,
} from 'kafkajs';
import { KafkaModuleOption } from '../../interfaces/kafka.interface';
import { IConsumerService } from './consumer.interface';
import retry = require('async-retry');

@Injectable()
export class ConsumerService
  implements IConsumerService, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ConsumerService.name);
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  private readonly topics: string[];
  private readonly options: KafkaModuleOption['options'];
  private onMessageHandler?: (message: KafkaMessage) => Promise<void>;
  private consumerRunning = false;

  constructor(
    topics: KafkaModuleOption['topics'],
    options: KafkaModuleOption['options'],
  ) {
    const { client, consumer: consumerConfig } = options;

    this.kafka = new Kafka({
      ...client,
    });

    this.consumer = this.kafka.consumer(consumerConfig);
    this.topics = topics;
    this.options = options;
  }

  async connect(): Promise<void> {
    await this.consumer.connect();
  }

  async disconnect(): Promise<void> {
    await this.consumer.disconnect();
  }

  async onModuleInit() {
    await this.connect();
    await this.subscribeTopics();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async subscribeTopics(): Promise<void> {
    await this.consumer.subscribe({
      topics: this.topics,
      fromBeginning: this.options.consumeFromBeginning ?? false,
    });
  }

  consume(onMessage: (message: KafkaMessage) => Promise<void>): void {
    this.onMessageHandler = onMessage;
    if (!this.consumerRunning) {
      this.consumerRunning = true;
      void this.handleEachBatch();
    }
  }

  async seekTo(record: TopicPartitionOffset): Promise<void> {
    const { topic, partition, offset } = record;

    const admin = this.kafka.admin();
    await admin.connect();

    const partitions = await admin.fetchTopicOffsets(topic);
    const target = partitions.find((p) => p.partition === partition);
    if (!target)
      throw new Error(
        `Partition ${partition} does not exist in topic ${topic}`,
      );

    const { low, high } = target;
    if (BigInt(offset) < BigInt(low) || BigInt(offset) >= BigInt(high)) {
      throw new Error(
        `Offset ${offset} is invalid (valid range is ${low} to ${BigInt(high) - 1n})`,
      );
    }

    try {
      this.consumer.pause([{ topic }]);
      this.consumer.seek({ topic, partition, offset });
    } finally {
      this.consumer.resume([{ topic }]);
    }
    this.logger.log(`Seeked ${topic}[${partition}] -> ${offset}`);
  }

  async handleEachMessage() {
    await this.consumer.run({
      ...this.options.consumerRunConfig,
      partitionsConsumedConcurrently: 3,
      eachMessage: async (payload: EachMessagePayload) => {
        const { topic, partition, message } = payload;
        this.logger.log(
          `Processing message from ${topic}:${partition}:${message.offset}`,
        );
        if (this.onMessageHandler) {
          try {
            await retry(async () => this.onMessageHandler?.(message), {
              retries: 3,
              onRetry: (err: Error, attempt: number) =>
                this.logger.log(
                  `Error consuming message, executing retry ${attempt}/3...`,
                  err,
                ),
            });
          } catch (error) {
            this.logger.error(
              `Error consuming message. Adding to dead letter queue...`,
              error,
            );
          }
        }
      },
    });
  }

  async handleEachBatch() {
    await this.consumer.run({
      ...this.options.consumerRunConfig,
      partitionsConsumedConcurrently: 3,
      autoCommit: false,
      eachBatchAutoResolve: false,
      eachBatch: async (payload: EachBatchPayload) => {
        const { batch } = payload;
        const { topic, partition, messages, highWatermark } = batch;
        this.logger.log(
          `Processing batch from ${topic}:${partition} with ${messages.length} messages`,
        );

        for (const message of messages) {
          if (!payload.isRunning() || payload.isStale()) break;

          try {
            if (this.onMessageHandler) {
              await retry(async () => this.onMessageHandler?.(message), {
                retries: 3,
                onRetry: (err: Error, attempt: number) =>
                  this.logger.log(
                    `Error consuming message, executing retry ${attempt}/3...`,
                    err,
                  ),
              });
            }
            payload.resolveOffset(message.offset);
            await payload.heartbeat();
          } catch (error) {
            this.logger.error('Error processing message in batch', error);
          }

          const uncommitted = payload.uncommittedOffsets();
          this.logger.log(
            `Uncommitted offsets for ${topic}-${partition}: ${JSON.stringify(uncommitted)}`,
          );

          const currentOffset = Number(message.offset);
          const watermark = Number(highWatermark);
          const lag = watermark - currentOffset - 1;
          this.logger.log(
            `Lag for ${topic}-${partition}: ${lag} messages (watermark=${watermark}, current=${currentOffset})`,
          );

          this.logger.log('Committed');
          await payload.commitOffsetsIfNecessary();
        }
      },
    });
  }
}
