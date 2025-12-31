import {
  ProducerBatch,
  ProducerRecord,
  RecordMetadata,
  Transaction,
} from 'kafkajs';
import { IBase } from '../../interfaces/base.interface';

export abstract class IProducerService extends IBase {
  abstract produce(message: ProducerRecord): Promise<RecordMetadata[]>;

  abstract produceMultipleTopics(
    message: ProducerBatch,
  ): Promise<RecordMetadata[]>;

  abstract transaction(): Promise<Transaction>;
}
