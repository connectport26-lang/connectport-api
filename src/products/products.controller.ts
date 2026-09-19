import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../common/decorators/auth.decorators';
import { ProductQueryDto } from './dto/products.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Public()
  @Get()
  list(@Query() query: ProductQueryDto) {
    return this.products.listPublished(query.q, query.limit ?? 100);
  }

  @Public()
  @Get(':slugOrId')
  get(@Param('slugOrId') slugOrId: string) {
    return this.products.getBySlugOrId(slugOrId);
  }
}
