import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { OpsRequestsController } from './ops-requests.controller';
import {
  CatalogOrdersController,
  RequesterRequestsController,
} from './requester-requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [QueueModule],
  controllers: [
    RequesterRequestsController,
    CatalogOrdersController,
    OpsRequestsController,
  ],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
