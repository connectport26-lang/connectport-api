import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsModule } from '../products/products.module';
import { QueueModule } from '../queue/queue.module';
import { OpsConsoleController } from './ops-console.controller';
import { OpsConsoleService } from './ops-console.service';

@Module({
  imports: [QueueModule, NotificationsModule, ProductsModule],
  controllers: [OpsConsoleController],
  providers: [OpsConsoleService],
})
export class OpsConsoleModule {}
