import { Module } from '@nestjs/common';
import { OpsConsoleController } from './ops-console.controller';
import { OpsConsoleService } from './ops-console.service';

@Module({
  controllers: [OpsConsoleController],
  providers: [OpsConsoleService],
})
export class OpsConsoleModule {}
