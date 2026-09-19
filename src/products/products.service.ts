import { Injectable, NotFoundException } from '@nestjs/common';
import { Product, ProductStatus } from '@prisma/client';
import { MailQueueService } from '../queue/queue.module';
import { buildRequestEmailContext } from '../mail/mail.context';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.module';
import {
  BulkProductStatusDto,
  CreateProductDto,
  UpdateProductDto,
} from './dto/products.dto';

const PUBLISHED_CACHE_KEY = 'cp:catalog:published:v1';
const CACHE_TTL_SEC = 45;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailQueue: MailQueueService,
    private readonly redis: RedisService,
  ) {}

  async listPublished(search?: string, limit = 100) {
    const take = Math.min(Math.max(limit, 1), 200);
    const q = search?.trim();
    if (!q) {
      const cached = await this.redis.get(PUBLISHED_CACHE_KEY);
      if (cached) {
        const all = JSON.parse(cached) as ReturnType<
          ProductsService['serialize']
        >[];
        return all.slice(0, take);
      }
    }
    const products = await this.findMany('published', q, take);
    if (!q) {
      // Cache a wider page for stampede protection
      const forCache = await this.findMany('published', undefined, 200);
      await this.redis.set(
        PUBLISHED_CACHE_KEY,
        JSON.stringify(forCache),
        CACHE_TTL_SEC,
      );
      return forCache.slice(0, take);
    }
    return products;
  }

  listAll(search?: string, status?: ProductStatus | 'all') {
    return this.findMany(
      status && status !== 'all' ? status : undefined,
      search,
      200,
    );
  }

  async getBySlugOrId(slugOrId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        status: 'published',
        OR: [{ slug: slugOrId }, { id: slugOrId }],
      },
    });
    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    return this.serializePublic(product);
  }

  async create(input: CreateProductDto) {
    const created = await this.prisma.product.create({
      data: {
        slug: input.slug.trim(),
        name: input.name.trim(),
        description: input.description.trim(),
        imageUrl: input.imageUrl.trim(),
        unitPrice: input.unitPrice,
        moq: input.moq,
        weightKg: input.weightKg,
        estimatedDeliveryDays: input.estimatedDeliveryDays,
        availability: input.availability,
        status: input.status ?? 'published',
        verified: input.verified ?? true,
        featuredOnLanding: input.featuredOnLanding ?? false,
        landingSort: input.landingSort ?? 0,
        tags: input.tags ?? [],
        sourceRequestId: input.sourceRequestId,
      },
    });
    await this.invalidateCatalogCache();
    return this.serialize(created);
  }

  async update(id: string, input: UpdateProductDto) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Product not found.');
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: input.name.trim() } : {}),
        ...(input.description != null
          ? { description: input.description.trim() }
          : {}),
        ...(input.imageUrl != null ? { imageUrl: input.imageUrl.trim() } : {}),
        ...(input.unitPrice != null ? { unitPrice: input.unitPrice } : {}),
        ...(input.moq != null ? { moq: input.moq } : {}),
        ...(input.weightKg != null ? { weightKg: input.weightKg } : {}),
        ...(input.estimatedDeliveryDays != null
          ? { estimatedDeliveryDays: input.estimatedDeliveryDays }
          : {}),
        ...(input.availability != null
          ? { availability: input.availability }
          : {}),
        ...(input.status != null ? { status: input.status } : {}),
        ...(input.verified != null ? { verified: input.verified } : {}),
        ...(input.featuredOnLanding != null
          ? { featuredOnLanding: input.featuredOnLanding }
          : {}),
        ...(input.landingSort != null ? { landingSort: input.landingSort } : {}),
        ...(input.tags != null ? { tags: input.tags } : {}),
        ...(input.sourceRequestId != null
          ? { sourceRequestId: input.sourceRequestId }
          : {}),
      },
    });
    await this.invalidateCatalogCache();
    return this.serialize(updated);
  }

  async publish(id: string) {
    return this.update(id, { status: 'published', verified: true });
  }

  async bulkUpdateStatus(input: BulkProductStatusDto) {
    const ids = [...new Set(input.ids.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) {
      return { updated: 0 };
    }

    await this.prisma.product.updateMany({
      where: { id: { in: ids } },
      data: {
        status: input.status,
        ...(input.status === 'published' ? { verified: true } : {}),
      },
    });

    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
    });

    await this.invalidateCatalogCache();

    for (const product of products) {
      await this.notifyProductStatus(product, input.status);
    }

    return {
      updated: products.length,
      products: products.map((p) => this.serialize(p)),
    };
  }

  private async notifyProductStatus(product: Product, status: ProductStatus) {
    const userIds = new Set<string>();

    if (product.sourceRequestId) {
      const request = await this.prisma.request.findUnique({
        where: { id: product.sourceRequestId },
        include: { user: true, references: true },
      });
      if (request) {
        userIds.add(request.userId);
        const context = buildRequestEmailContext({
          reference: request.reference,
          sourceType: request.sourceType,
          sourceValue: request.sourceValue,
          quantity: request.quantity,
          budgetMax: Number(request.budgetMax),
          qualityNotes: request.qualityNotes,
          flexibility: request.flexibility,
          productName: request.productName,
          productDescription: request.productDescription,
          budgetScope: request.budgetScope,
          needByDate: request.needByDate?.toISOString() ?? null,
          needByTimeframe: request.needByTimeframe,
          references: request.references,
        });
        await this.prisma.notification.create({
          data: {
            requestId: request.id,
            channel: 'email',
            message: `${request.reference}: product "${product.name}" is now ${status}.`,
          },
        });
        await this.mailQueue.enqueue({
          to: request.user.email,
          subject: `${request.reference}: product ${status}`,
          headline: `Your product is now ${status}`,
          body: `Hi ${request.user.name.split(' ')[0] || request.user.name},\n\n"${product.name}" linked to ${request.reference} is now ${status} on ConnectPort.`,
          ctaLabel: status === 'published' ? 'View store' : 'View request',
          ctaPath:
            status === 'published'
              ? `/store/${product.slug}`
              : `/requests/${request.id}`,
          snippet: context.snippet,
          details: context.details,
        });
      }
    }

    if (status === 'published') {
      const quotes = await this.prisma.quote.findMany({
        where: { supplierRef: product.id },
        include: {
          request: { include: { user: true, references: true } },
        },
      });
      for (const quote of quotes) {
        if (userIds.has(quote.request.userId)) continue;
        userIds.add(quote.request.userId);
        const req = quote.request;
        const context = buildRequestEmailContext({
          reference: req.reference,
          sourceType: req.sourceType,
          sourceValue: req.sourceValue,
          quantity: req.quantity,
          budgetMax: Number(req.budgetMax),
          qualityNotes: req.qualityNotes,
          flexibility: req.flexibility,
          productName: req.productName,
          productDescription: req.productDescription,
          budgetScope: req.budgetScope,
          needByDate: req.needByDate?.toISOString() ?? null,
          needByTimeframe: req.needByTimeframe,
          references: req.references,
        });
        await this.prisma.notification.create({
          data: {
            requestId: quote.requestId,
            channel: 'email',
            message: `${quote.request.reference}: "${product.name}" is now on the store.`,
          },
        });
        await this.mailQueue.enqueue({
          to: quote.request.user.email,
          subject: `${quote.request.reference}: product published`,
          headline: 'A product from your quote is live',
          body: `Hi ${quote.request.user.name.split(' ')[0] || quote.request.user.name},\n\n"${product.name}" is now published on the ConnectPort store.`,
          ctaLabel: 'View product',
          ctaPath: `/store/${product.slug}`,
          snippet: context.snippet,
          details: context.details,
        });
      }
    }
  }

  private async invalidateCatalogCache() {
    await this.redis.del(PUBLISHED_CACHE_KEY);
  }

  private async findMany(
    status?: ProductStatus,
    search?: string,
    take = 200,
  ) {
    const q = search?.trim();
    const products = await this.prisma.product.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { slug: { contains: q, mode: 'insensitive' } },
                { tags: { has: q.toLowerCase() } },
              ],
            }
          : {}),
      },
      take,
      orderBy: [
        { featuredOnLanding: 'desc' },
        { landingSort: 'asc' },
        { createdAt: 'desc' },
      ],
    });
    return products.map((product) =>
      status === 'published'
        ? this.serializePublic(product)
        : this.serialize(product),
    );
  }

  private serializePublic(product: Product) {
    const full = this.serialize(product);
    const { sourceRequestId: _omit, ...rest } = full;
    return rest;
  }

  private serialize(product: Product) {
    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      imageUrl: product.imageUrl,
      unitPrice: Number(product.unitPrice),
      currency: product.currency as 'NGN',
      moq: product.moq,
      weightKg: Number(product.weightKg),
      estimatedDeliveryDays: product.estimatedDeliveryDays,
      availability: product.availability,
      status: product.status,
      verified: product.verified,
      featuredOnLanding: product.featuredOnLanding,
      landingSort: product.landingSort,
      tags: product.tags,
      sourceRequestId: product.sourceRequestId ?? undefined,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }
}
