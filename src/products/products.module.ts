import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { OpsProductsController } from './ops-products.controller';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [QueueModule],
  controllers: [ProductsController, OpsProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
