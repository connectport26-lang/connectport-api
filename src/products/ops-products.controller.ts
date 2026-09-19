import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequireOps } from '../common/decorators/auth.decorators';
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
  create(@Body() body: CreateProductDto) {
    return this.products.create(body);
  }

  @Post('bulk-status')
  bulkStatus(@Body() body: BulkProductStatusDto) {
    return this.products.bulkUpdateStatus(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateProductDto) {
    return this.products.update(id, body);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string) {
    return this.products.publish(id);
  }
}
