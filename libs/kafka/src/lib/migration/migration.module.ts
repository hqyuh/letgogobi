import { Module } from '@nestjs/common';
import { CommandModule } from 'nestjs-command';
import { MigrationKafkaTopicsSeed } from './seeds/migration.kafka-topics.seed';
import { KafkaAdminModule } from '../kafka.admin.module';

@Module({
  imports: [CommandModule, KafkaAdminModule],
  providers: [MigrationKafkaTopicsSeed],
  exports: [],
})
export class MigrationModule {}
