import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  RequireOps,
  RequireOpsPermission,
} from '../common/decorators/auth.decorators';
import {
  BulkProductStatusDto,
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto,
} from './dto/products.dto';
import { ProductsService } from './products.service';

@Controller('ops/products')
@RequireOps()
export class OpsProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() query: ProductQueryDto) {
    return this.products.listAll(query.q, query.status);
  }

  @Post()
  @RequireOpsPermission('catalog.manage')
  create(@Body() body: CreateProductDto) {
    return this.products.create(body);
  }

  @Post('bulk-status')
  @RequireOpsPermission('catalog.manage')
  bulkStatus(@Body() body: BulkProductStatusDto) {
    return this.products.bulkUpdateStatus(body);
  }

  @Patch(':id')
  @RequireOpsPermission('catalog.manage')
  update(@Param('id') id: string, @Body() body: UpdateProductDto) {
    return this.products.update(id, body);
  }

  @Post(':id/publish')
  @RequireOpsPermission('catalog.manage')
  publish(@Param('id') id: string) {
    return this.products.publish(id);
  }
}
