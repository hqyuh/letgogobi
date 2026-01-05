import { Injectable } from '@nestjs/common';
import { PrismaService } from '@libs/prisma/lib/services/prisma.service';

@Injectable()
export class OrderService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrder(idempotencyKey: string) {
    // Create order ID simply
    const orderId = `order-${Date.now()}`;

    // Use transaction to ensure consistency (Outbox Pattern)
    const result = await this.prisma.$transaction(async (tx) => {
      const outboxEvent = await tx.outboxEvent.create({
        data: {
          aggregateType: 'Order',
          aggregateId: orderId,
          payload: {
            orderId,
            idempotencyKey,
            status: 'created',
            createdAt: new Date().toISOString(),
            message: 'Order created successfully',
          },
        },
      });

      return {
        orderId,
        idempotencyKey,
        outboxEventId: outboxEvent.id,
      };
    });

    return {
      ...result,
      message: 'Order created successfully - Debezium will capture this event',
    };
  }

  async createOrderDelay(idempotencyKey: string) {
    // Simulate processing time of 10 seconds
    await new Promise((resolve) => setTimeout(resolve, 10000));
    return {
      orderId: `order-${Date.now()}`,
      idempotencyKey,
      message: 'Order created successfully',
    };
  }
}
