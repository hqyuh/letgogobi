import { Injectable } from '@nestjs/common';

@Injectable()
export class OrderService {
  async createOrder(idempotencyKey: string) {
    // Simulate processing time of 10 seconds
    await new Promise((resolve) => setTimeout(resolve, 10000));
    return {
      orderId: `order-${Date.now()}`,
      idempotencyKey,
      message: 'Order created successfully',
    };
  }
}
