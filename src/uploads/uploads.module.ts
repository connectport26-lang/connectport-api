import { Module } from '@nestjs/common';
import { OpsUploadsController } from './ops-uploads.controller';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  controllers: [UploadsController, OpsUploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
