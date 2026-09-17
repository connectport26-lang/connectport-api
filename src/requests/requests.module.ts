import { Module } from '@nestjs/common';
import { OpsRequestsController } from './ops-requests.controller';
import { RequesterRequestsController } from './requester-requests.controller';
import { RequestsService } from './requests.service';

@Module({
  controllers: [RequesterRequestsController, OpsRequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
