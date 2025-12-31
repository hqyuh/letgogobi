import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Kafka, Admin, KafkaConfig, ITopicConfig } from 'kafkajs';
import { KafkaCreateTopics } from '../constants/kafka.const';
import { IKafkaAdmin } from './admin.interface';

@Injectable()
export class KafkaAdminService
  implements IKafkaAdmin, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(KafkaAdminService.name);
  private readonly kafka: Kafka;
  private readonly admin: Admin;
  private readonly brokers: string[];
  private readonly clientId: string;
  private readonly kafkaOptions: KafkaConfig;
  private readonly topics = KafkaCreateTopics;
  private readonly defaultPartition = 3;

  constructor() {
    this.clientId = 'KAFKA_ADMIN_CLIENT_ID';
    this.brokers = ['localhost:9094'];
    this.kafkaOptions = {
      clientId: this.clientId,
      brokers: this.brokers,
    };
    this.kafka = new Kafka(this.kafkaOptions);
    this.admin = this.kafka.admin();
  }

  async getAllTopic(): Promise<string[]> {
    return await this.admin.listTopics();
  }

  async getAllTopicUnique(): Promise<string[]> {
    return [...new Set(await this.getAllTopic())].filter(
      (val) => val !== '__consumer_offsets',
    );
  }

  async connect(): Promise<void> {
    await this.admin.connect();
  }

  async disconnect(): Promise<void> {
    await this.admin.disconnect();
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async createTopics(): Promise<boolean> {
    this.logger.log(`Topics: ${this.topics.map((t) => t.topic).join(', ')}`);
    const currentTopic: string[] = await this.getAllTopicUnique();
    const data: ITopicConfig[] = [];

    for (const topic of this.topics) {
      const partition: number = topic.partition ?? this.defaultPartition;
      const replicationFactor: number =
        topic.replicationFactor &&
        topic.replicationFactor <= this.brokers.length
          ? topic.replicationFactor
          : this.brokers.length;

      if (!currentTopic.includes(topic.topic)) {
        data.push({
          topic: topic.topic,
          numPartitions: partition,
          replicationFactor: replicationFactor,
        });
      }

      if (topic.topicReply && !currentTopic.includes(topic.topicReply)) {
        data.push({
          topic: topic.topicReply,
          numPartitions: partition,
          replicationFactor,
        });
      }
    }

    if (data.length > 0) {
      await this.admin.createTopics({
        waitForLeaders: true,
        topics: data,
      });
    }
    this.logger.log(`${KafkaAdminService.name} Topic Created`);
    return true;
  }

  async deleteTopics(): Promise<boolean> {
    const currentTopic: string[] = await this.getAllTopicUnique();

    const data: string[] = [];

    for (const topic of this.topics) {
      if (currentTopic.includes(topic.topic)) {
        data.push(topic.topic);
      }

      if (topic.topicReply && currentTopic.includes(topic.topicReply)) {
        data.push(topic.topicReply);
      }
    }

    if (data.length > 0) {
      await this.admin.deleteTopics({
        topics: data,
      });
    }
    this.logger.log(`${KafkaAdminService.name} Topic Deleted`);
    return true;
  }
}
