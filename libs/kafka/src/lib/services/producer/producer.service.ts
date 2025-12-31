import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  Kafka,
  Offsets,
  PartitionerArgs,
  Producer,
  ProducerBatch,
  ProducerRecord,
  RecordMetadata,
  Transaction,
} from 'kafkajs';
import { KafkaModuleOption } from '../../interfaces/kafka.interface';
import { IProducerService } from './producer.interface';

@Injectable()
export class ProducerService
  implements IProducerService, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ProducerService.name);
  private readonly kafka: Kafka;
  private readonly producer: Producer;

  constructor(options: KafkaModuleOption['options']) {
    const { client, producer: producerConfig } = options;

    this.kafka = new Kafka({
      ...client,
    });

    this.producer = this.kafka.producer(producerConfig);
  }

  async connect(): Promise<void> {
    await this.producer.connect();
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async produce(message: ProducerRecord): Promise<RecordMetadata[]> {
    this.logger.log('Send message: ', `${JSON.stringify(message)}`);
    const metadata = await this.producer.send(message);
    return metadata;
  }

  async produceMultipleTopics(
    messages: ProducerBatch,
  ): Promise<RecordMetadata[]> {
    const metadata = await this.producer.sendBatch(messages);
    this.logger.log('Send batch messags: ', `${JSON.stringify(messages)}`);
    return metadata;
  }

  async transaction(): Promise<Transaction> {
    const producer = this.producer;
    if (!producer) {
      const msg = 'There is no producer, unable to start transactions.';
      this.logger.error(msg);
      throw new Error(msg);
    }

    const tx = await producer.transaction();
    const retval: Transaction = {
      abort(): Promise<void> {
        return tx.abort();
      },
      commit(): Promise<void> {
        return tx.commit();
      },
      isActive(): boolean {
        return tx.isActive();
      },
      async send(message: ProducerRecord): Promise<RecordMetadata[]> {
        return await tx.send(message);
      },
      async sendBatch(batch: ProducerBatch): Promise<RecordMetadata[]> {
        return await tx.sendBatch(batch);
      },
      sendOffsets(
        offsets: Offsets & { consumerGroupId: string },
      ): Promise<void> {
        return tx.sendOffsets(offsets);
      },
    };
    return retval;
  }

  static CustomPartitioner = () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return ({ topic, partitionMetadata, message }: PartitionerArgs) => {
      const numPartitions = partitionMetadata.length;
      const value = message.value?.toString();

      if (value?.includes('"tier":"VIP"')) {
        return 0;
      }
      const randomPartition =
        Math.floor(Math.random() * (numPartitions - 1)) + 1;
      return randomPartition;
    };
  };
}
