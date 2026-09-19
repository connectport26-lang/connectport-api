import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OpsNotifyService } from './ops-notify.service';

@Module({
  imports: [PrismaModule, QueueModule],
  providers: [OpsNotifyService],
  exports: [OpsNotifyService],
})
export class NotificationsModule {}
