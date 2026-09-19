import { Module } from '@nestjs/common';
import { OpsFindUploadsController } from './ops-find-uploads.controller';
import { OpsUploadsController } from './ops-uploads.controller';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  controllers: [UploadsController, OpsUploadsController, OpsFindUploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
