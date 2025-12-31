import { IBase } from '../../interfaces/base.interface';
import { KafkaMessage, TopicPartitionOffset } from 'kafkajs';

export abstract class IConsumerService extends IBase {
  abstract consume(onMessage: (message: KafkaMessage) => Promise<void>): void;
  abstract seekTo(record: TopicPartitionOffset): Promise<void>;
}
