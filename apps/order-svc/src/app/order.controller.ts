import { Controller, Post, Headers, UseInterceptors } from '@nestjs/common';
import { IdempotencyInterceptor } from '@libs/interceptors/idempotency.interceptor';
import { OrderService } from './order.service';

@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  async createOrder(@Headers('idempotency-key') idempotencyKey: string) {
    return this.orderService.createOrder(idempotencyKey);
  }
}
