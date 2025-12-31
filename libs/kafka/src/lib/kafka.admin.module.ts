import { Module } from '@nestjs/common';
import { KafkaAdminService } from './services/admin.service';
import { KafkaModule } from './kafka.module';

@Module({
  providers: [KafkaAdminService],
  exports: [KafkaAdminService],
  imports: [KafkaModule],
})
export class KafkaAdminModule {}
