/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test } from '@nestjs/testing';
import { OrderService } from './order.service';

describe('OrderService', () => {
  let service: OrderService;

  beforeAll(async () => {
    const app = await Test.createTestingModule({
      providers: [OrderService],
    }).compile();

    service = app.get<OrderService>(OrderService);
  });
});
