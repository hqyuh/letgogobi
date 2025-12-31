import { IKafkaCreateTopic } from '../interfaces/kafka.interface';

export const KAFKA_SERVICE_NAME = 'KAFKA_SERVICE';
export const KAFKA_MODULE_OPTIONS = 'KAFKA_MODULE_OPTIONS';

export const PRODUCER_SERVICE = 'PRODUCER_SERVICE';
export const CONSUMER_SERVICE = 'CONSUMER_SERVICE';

export enum ENUM_KAFKA_TOPICS {
  ORDER_SVC_CREATED = 'order-svc.created',
}

export const KafkaCreateTopics: IKafkaCreateTopic[] = Object.values(
  ENUM_KAFKA_TOPICS,
).map((val) => ({
  topic: val,
  topicReply: `${val}.reply`,
  partition: 3,
}));
