import { Test, TestingModule } from '@nestjs/testing';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';

describe('OrderController', () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let app: TestingModule;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [OrderService],
    }).compile();
  });
});
