/**
 * Idempotent catalog seed: upserts published products by slug.
 * Safe for empty or existing DBs (does not wipe data).
 *
 * Usage:
 *   DATABASE_URL=... npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/seed-catalog.ts
 *   npm run prisma:seed-catalog
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const products = [
  {
    slug: 'street-runner-sneakers-white',
    name: 'Street Runner Sneakers',
    description:
      'Breathable knit upper, cushioned sole, clean white finish. Built for everyday wear and bulk fashion drops.',
    imageUrl:
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&q=80',
    unitPrice: 14500,
    moq: 24,
    weightKg: 0.85,
    estimatedDeliveryDays: 18,
    availability: 'made_to_order' as const,
    featuredOnLanding: true,
    landingSort: 1,
    tags: ['fashion', 'sneakers', 'footwear', 'streetwear'],
  },
  {
    slug: 'premium-cotton-polo-navy',
    name: 'Premium Cotton Polo - Navy',
    description:
      '220gsm pique cotton, reinforced collar, retail-ready packaging. Reliable staple for apparel catalogs.',
    imageUrl:
      'https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=900&q=80',
    unitPrice: 6200,
    moq: 50,
    weightKg: 0.28,
    estimatedDeliveryDays: 16,
    availability: 'in_stock' as const,
    featuredOnLanding: true,
    landingSort: 2,
    tags: ['cloth', 'apparel', 'polo', 'fashion'],
  },
  {
    slug: 'wireless-noise-cancel-earbuds',
    name: 'Wireless Noise-Cancel Earbuds',
    description:
      'ANC buds with charging case, USB-C, and stable Bluetooth. Compact carton suitable for electronics wholesale.',
    imageUrl:
      'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=900&q=80',
    unitPrice: 28500,
    moq: 20,
    weightKg: 0.18,
    estimatedDeliveryDays: 21,
    availability: 'limited' as const,
    featuredOnLanding: true,
    landingSort: 3,
    tags: ['electronic', 'audio', 'earbuds', 'gadgets'],
  },
  {
    slug: 'matte-black-dining-chair',
    name: 'Matte Black Dining Chair',
    description:
      'Powder-coated steel frame with PU seat. Stackable profile for cafes, offices, and furniture programs.',
    imageUrl:
      'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=900&q=80',
    unitPrice: 19500,
    moq: 30,
    weightKg: 4.5,
    estimatedDeliveryDays: 28,
    availability: 'in_stock' as const,
    featuredOnLanding: true,
    landingSort: 4,
    tags: ['furniture', 'chair', 'dining', 'home'],
  },
  {
    slug: 'nonstick-kitchen-cookware-set',
    name: 'Nonstick Kitchen Cookware Set',
    description:
      '7-piece aluminum set with glass lids and soft-touch handles. Flat-pack carton for kitchen retail.',
    imageUrl:
      'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=900&q=80',
    unitPrice: 42000,
    moq: 12,
    weightKg: 6.2,
    estimatedDeliveryDays: 24,
    availability: 'made_to_order' as const,
    featuredOnLanding: false,
    landingSort: 0,
    tags: ['kitchen', 'cookware', 'home', 'housewares'],
  },
  {
    slug: 'wireless-gaming-controller',
    name: 'Wireless Gaming Controller',
    description:
      'Ergonomic dual-analog pad with vibration feedback and USB-C charging. Compatible with major consoles and PC.',
    imageUrl:
      'https://images.unsplash.com/photo-1592840496694-26d035b52b48?w=900&q=80',
    unitPrice: 31800,
    moq: 20,
    weightKg: 0.42,
    estimatedDeliveryDays: 20,
    availability: 'in_stock' as const,
    featuredOnLanding: false,
    landingSort: 0,
    tags: ['game', 'controller', 'gaming', 'electronic'],
  },
  {
    slug: 'car-phone-mount-magnetic',
    name: 'Magnetic Car Phone Mount',
    description:
      'Strong magnet cradle with vent and dash kits. Stable hold for navigation; retail blister ready.',
    imageUrl:
      'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=900&q=80',
    unitPrice: 8900,
    moq: 40,
    weightKg: 0.22,
    estimatedDeliveryDays: 15,
    availability: 'in_stock' as const,
    featuredOnLanding: false,
    landingSort: 0,
    tags: ['car', 'automotive', 'accessories', 'phone'],
  },
  {
    slug: 'oversized-denim-jacket-indigo',
    name: 'Oversized Denim Jacket - Indigo',
    description:
      '12oz denim, metal hardware, relaxed fit. Core fashion outerwear for seasonal wholesale.',
    imageUrl:
      'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=900&q=80',
    unitPrice: 16800,
    moq: 24,
    weightKg: 0.95,
    estimatedDeliveryDays: 22,
    availability: 'made_to_order' as const,
    featuredOnLanding: false,
    landingSort: 0,
    tags: ['fashion', 'denim', 'jacket', 'cloth'],
  },
  {
    slug: 'portable-bluetooth-speaker',
    name: 'Portable Bluetooth Speaker',
    description:
      'IPX5 shell, 12-hour battery, USB-C. Compact electronics SKU for gift and gadget assortments.',
    imageUrl:
      'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=900&q=80',
    unitPrice: 22400,
    moq: 25,
    weightKg: 0.55,
    estimatedDeliveryDays: 19,
    availability: 'limited' as const,
    featuredOnLanding: false,
    landingSort: 0,
    tags: ['electronic', 'speaker', 'audio', 'gadgets'],
  },
  {
    slug: 'modular-storage-shelf-oak',
    name: 'Modular Storage Shelf - Oak',
    description:
      'Three-tier oak-look laminate shelf with steel uprights. Flat-pack furniture for home and retail fit-outs.',
    imageUrl:
      'https://images.unsplash.com/photo-1595428774223-ef526f69f003?w=900&q=80',
    unitPrice: 38500,
    moq: 10,
    weightKg: 12.5,
    estimatedDeliveryDays: 30,
    availability: 'made_to_order' as const,
    featuredOnLanding: false,
    landingSort: 0,
    tags: ['furniture', 'shelf', 'storage', 'home'],
  },
];

async function main() {
  let upserted = 0;
  for (const product of products) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      create: {
        ...product,
        currency: 'NGN',
        status: 'published',
        verified: true,
      },
      update: {
        name: product.name,
        description: product.description,
        imageUrl: product.imageUrl,
        unitPrice: product.unitPrice,
        moq: product.moq,
        weightKg: product.weightKg,
        estimatedDeliveryDays: product.estimatedDeliveryDays,
        availability: product.availability,
        featuredOnLanding: product.featuredOnLanding,
        landingSort: product.landingSort,
        tags: product.tags,
        status: 'published',
        verified: true,
      },
    });
    upserted += 1;
    console.log(`upserted ${product.slug}`);
  }
  console.log(`Done. ${upserted} catalog products ready.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
