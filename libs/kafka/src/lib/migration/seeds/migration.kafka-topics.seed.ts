import { Command } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { KafkaAdminService } from '../../services/admin.service';

@Injectable()
export class MigrationKafkaTopicsSeed {
  constructor(private readonly kafkaAdminService: KafkaAdminService) {}

  @Command({
    command: 'insert:kafka-topics',
    describe: 'insert kafka topics',
  })
  async insert(): Promise<void> {
    try {
      await this.kafkaAdminService.createTopics();
    } catch (error) {
      throw new Error(`Failed to create Kafka topics: ${String(error)}`);
    }
  }

  @Command({
    command: 'remove:kafka-topics',
    describe: 'remove kafka topics',
  })
  async delete(): Promise<void> {
    try {
      await this.kafkaAdminService.deleteTopics();
    } catch (error) {
      throw new Error(`Failed to create Kafka topics: ${String(error)}`);
    }
  }
}
