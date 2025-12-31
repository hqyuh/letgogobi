import { Module, DynamicModule } from '@nestjs/common';
import { KafkaModuleOption } from './interfaces/kafka.interface';
import { ProducerService } from './services/producer/producer.service';
import { PRODUCER_SERVICE, CONSUMER_SERVICE } from './constants/kafka.const';
import { ConsumerService } from './services/comsumer/consumer.service';

@Module({})
export class KafkaModule {
  static register(options: KafkaModuleOption): DynamicModule {
    return {
      module: KafkaModule,
      providers: [
        {
          provide: PRODUCER_SERVICE,
          useFactory: () => new ProducerService(options.options),
        },
        {
          provide: CONSUMER_SERVICE,
          useFactory: () =>
            new ConsumerService(options.topics, options.options),
        },
      ],
      exports: [PRODUCER_SERVICE, CONSUMER_SERVICE],
    };
  }
}
