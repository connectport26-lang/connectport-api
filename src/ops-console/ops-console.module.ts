import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { QueueModule } from '../queue/queue.module';
import { OpsConsoleController } from './ops-console.controller';
import { OpsConsoleService } from './ops-console.service';

@Module({
  imports: [QueueModule, NotificationsModule],
  controllers: [OpsConsoleController],
  providers: [OpsConsoleService],
})
export class OpsConsoleModule {}
