import {
  KafkaConfig,
  ConsumerConfig,
  ConsumerRunConfig,
  ProducerConfig,
  ProducerRecord,
  Message,
  Transaction,
} from 'kafkajs';

export interface IKafkaCreateTopic {
  topic: string;
  topicReply?: string;
  partition?: number;
  replicationFactor?: number;
}

export interface KafkaModuleOption {
  name: string;
  topics: string[];
  options: {
    client: KafkaConfig;
    consumer: ConsumerConfig;
    consumerRunConfig?: ConsumerRunConfig;
    producer?: ProducerConfig;
    consumeFromBeginning?: boolean;
    seek?: Record<string, number | 'earliest' | Date>;
    autoConnect?: boolean;
  };
}

export type IKafkaMessageObject = Message;

export interface KafkaMessageSend extends Omit<ProducerRecord, 'topic'> {
  messages: IKafkaMessageObject[];
  topic?: string;
}

export interface IKafkaMessageHeader {
  [key: string]: number[];
}

export type KafkaTransaction = Transaction;
