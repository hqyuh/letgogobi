import { Controller, OnModuleInit } from '@nestjs/common';
import { NotificationService } from './notification.service';

@Controller()
export class NotificationConsumer implements OnModuleInit {
  constructor(private readonly notificationService: NotificationService) {}

  async onModuleInit() {
    this.notificationService.handleSendNotification();
  }
}
