import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to seed: NODE_ENV=production. Seeding wipes data and must not run against production.',
    );
  }

  const ADMIN_PASSWORD =
    process.env.SEED_ADMIN_PASSWORD?.trim() || 'connectport-dev-admin';
  const SAMPLE_PASSWORD =
    process.env.SEED_SAMPLE_PASSWORD?.trim() || 'connectport-sample';
  const ADMIN_EMAIL =
    process.env.SEED_ADMIN_EMAIL?.trim() || 'admin@connectport.local';

  await prisma.notification.deleteMany();
  await prisma.statusUpdate.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.request.deleteMany();
  await prisma.product.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.emailOtp.deleteMany();
  await prisma.credential.deleteMany();
  await prisma.user.deleteMany();
  await prisma.opsUser.deleteMany();

  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS request_reference_seq START WITH 1001`,
  );

  await prisma.product.createMany({
    data: [
      {
        id: 'prod_hoodie',
        slug: 'oversized-heavyweight-hoodie-black',
        name: 'Oversized Heavyweight Hoodie',
        description:
          '350gsm cotton fleece with a boxy streetwear cut. Soft handfeel, ribbed hem, verified stitching quality.',
        imageUrl:
          'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=900&q=80',
        unitPrice: 8500,
        moq: 20,
        weightKg: 0.65,
        estimatedDeliveryDays: 18,
        availability: 'made_to_order',
        status: 'published',
        verified: true,
        featuredOnLanding: true,
        landingSort: 1,
        tags: ['hoodie', 'black', 'streetwear', 'apparel'],
        createdAt: new Date('2026-02-01T12:00:00.000Z'),
      },
      {
        id: 'prod_tech_fleece',
        slug: 'tech-fleece-tracksuit-set',
        name: 'Tech Fleece Tracksuit Set',
        description:
          'Jacket + jogger set in brushed fleece. Clean silhouette, tapered legs, ready for bulk drops.',
        imageUrl:
          'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=900&q=80',
        unitPrice: 22000,
        moq: 10,
        weightKg: 1.1,
        estimatedDeliveryDays: 21,
        availability: 'limited',
        status: 'published',
        verified: true,
        featuredOnLanding: false,
        landingSort: 0,
        tags: ['fleece', 'tracksuit', 'set', 'streetwear'],
        createdAt: new Date('2026-02-10T12:00:00.000Z'),
      },
      {
        id: 'prod_chair',
        slug: 'cafe-stackable-chair-matte-black',
        name: 'Cafe Stackable Chair',
        description:
          'Matte black powder coat, PU seat, stackable for tight storage. Built for restaurants and cafés.',
        imageUrl:
          'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=900&q=80',
        unitPrice: 18500,
        moq: 30,
        weightKg: 4.2,
        estimatedDeliveryDays: 28,
        availability: 'in_stock',
        status: 'published',
        verified: true,
        featuredOnLanding: true,
        landingSort: 2,
        tags: ['chair', 'restaurant', 'furniture'],
        createdAt: new Date('2026-03-01T12:00:00.000Z'),
      },
      {
        id: 'prod_skincare',
        slug: 'minimal-glass-skincare-set',
        name: 'Minimal Glass Skincare Set',
        description:
          'Amber glass droppers and pump jars. Private-label ready packaging, verified finish.',
        imageUrl:
          'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=900&q=80',
        unitPrice: 3400,
        moq: 50,
        weightKg: 0.28,
        estimatedDeliveryDays: 20,
        availability: 'made_to_order',
        status: 'published',
        verified: true,
        featuredOnLanding: false,
        landingSort: 0,
        tags: ['skincare', 'packaging', 'beauty'],
        createdAt: new Date('2026-03-12T12:00:00.000Z'),
      },
      {
        id: 'prod_tote',
        slug: 'canvas-tote-natural',
        name: 'Heavy Canvas Tote - Natural',
        description:
          '16oz canvas, reinforced handles, clean branding panel. Ideal for merch runs.',
        imageUrl:
          'https://images.unsplash.com/photo-1590874103328-eac38a67478e?w=900&q=80',
        unitPrice: 2800,
        moq: 50,
        weightKg: 0.35,
        estimatedDeliveryDays: 16,
        availability: 'in_stock',
        status: 'published',
        verified: true,
        featuredOnLanding: true,
        landingSort: 3,
        tags: ['tote', 'canvas', 'merch', 'bag'],
        createdAt: new Date('2026-03-18T12:00:00.000Z'),
      },
      {
        id: 'prod_lamp',
        slug: 'soft-glow-desk-lamp',
        name: 'Soft Glow Desk Lamp',
        description:
          'Warm LED, touch dimmer, matte finish. Compact footprint for desks and bedside.',
        imageUrl:
          'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=900&q=80',
        unitPrice: 12500,
        moq: 20,
        weightKg: 1.4,
        estimatedDeliveryDays: 22,
        availability: 'made_to_order',
        status: 'published',
        verified: true,
        featuredOnLanding: false,
        landingSort: 0,
        tags: ['lamp', 'home', 'desk', 'lighting'],
        createdAt: new Date('2026-04-01T12:00:00.000Z'),
      },
    ],
  });

  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const sampleHash = await bcrypt.hash(SAMPLE_PASSWORD, 12);

  await prisma.user.createMany({
    data: [
      {
        id: 'user_ada',
        name: 'Ada Okonkwo',
        email: 'ada@example.com',
        phone: '+2348011111111',
        accountType: 'individual',
        createdAt: new Date('2026-08-12T09:00:00.000Z'),
      },
      {
        id: 'user_kemi',
        name: 'Kemi Adeyemi',
        email: 'kemi@shop.ng',
        phone: '+2348022222222',
        accountType: 'business',
        createdAt: new Date('2026-07-04T11:00:00.000Z'),
      },
    ],
  });

  await prisma.opsUser.createMany({
    data: [
      {
        id: 'ops_admin',
        name: 'Korede',
        email: ADMIN_EMAIL,
        role: 'admin',
      },
      {
        id: 'ops_chioma',
        name: 'Chioma Eze',
        email: 'chioma@connectport.ng',
        role: 'agent',
      },
    ],
  });

  await prisma.credential.createMany({
    data: [
      {
        email: 'ada@example.com',
        passwordHash: sampleHash,
        kind: 'requester',
        userId: 'user_ada',
      },
      {
        email: 'kemi@shop.ng',
        passwordHash: sampleHash,
        kind: 'requester',
        userId: 'user_kemi',
      },
      {
        email: ADMIN_EMAIL,
        passwordHash: adminHash,
        kind: 'ops',
        opsUserId: 'ops_admin',
      },
      {
        email: 'chioma@connectport.ng',
        passwordHash: sampleHash,
        kind: 'ops',
        opsUserId: 'ops_chioma',
      },
    ],
  });

  await prisma.team.create({
    data: {
      id: 'team_sourcing',
      name: 'Sourcing desk',
      members: {
        create: [
          { opsUserId: 'ops_admin' },
          { opsUserId: 'ops_chioma' },
        ],
      },
    },
  });

  await prisma.team.create({
    data: {
      id: 'team_logistics',
      name: 'Logistics',
      members: {
        create: [{ opsUserId: 'ops_admin' }],
      },
    },
  });

  await prisma.request.createMany({
    data: [
      {
        id: 'req_submitted',
        reference: 'CP-1042',
        userId: 'user_ada',
        sourceType: 'link',
        sourceValue:
          'https://www.alibaba.com/product-detail/wireless-earbuds.html',
        quantity: 20,
        budgetMax: 450000,
        timeline: 'In 4 weeks',
        qualityNotes:
          'Need ANC, USB-C charging case, 1-year warranty if possible.',
        flexibility: 'flexible',
        status: 'submitted',
        assignedOpsUserId: null,
        createdAt: new Date('2026-09-08T08:12:00.000Z'),
      },
      {
        id: 'req_quoted',
        reference: 'CP-1038',
        userId: 'user_ada',
        sourceType: 'text',
        sourceValue:
          'Stainless steel 2-burner gas cooker similar to the ones used in Lagos canteens. Must ship with extra jets for LPG.',
        quantity: 12,
        budgetMax: 900000,
        timeline: 'As soon as possible',
        qualityNotes: 'Heavy-duty, not household grade. CE mark preferred.',
        flexibility: 'exact',
        status: 'quoted',
        assignedOpsUserId: 'ops_admin',
        createdAt: new Date('2026-09-02T14:40:00.000Z'),
      },
      {
        id: 'req_paid',
        reference: 'CP-1019',
        userId: 'user_kemi',
        sourceType: 'photo',
        sourceValue: '/connectport-logo.png',
        quantity: 80,
        budgetMax: 3200000,
        timeline: 'Before October',
        qualityNotes:
          'Match the sample photo as closely as possible. Matte black finish.',
        flexibility: 'flexible',
        status: 'in_transit_freight',
        assignedOpsUserId: 'ops_chioma',
        createdAt: new Date('2026-08-18T10:00:00.000Z'),
      },
      {
        id: 'req_delivered',
        reference: 'CP-1004',
        userId: 'user_kemi',
        sourceType: 'link',
        sourceValue: 'https://detail.1688.com/offer/example.html',
        quantity: 40,
        budgetMax: 1500000,
        timeline: '6 weeks',
        qualityNotes: 'Food-grade silicone, FDA docs if available.',
        flexibility: 'exact',
        status: 'delivered',
        assignedOpsUserId: 'ops_admin',
        marketplaceEligible: true,
        createdAt: new Date('2026-07-20T09:30:00.000Z'),
      },
    ],
  });

  await prisma.quote.createMany({
    data: [
      {
        id: 'quote_1038_primary',
        requestId: 'req_quoted',
        agentId: 'ops_admin',
        supplierRef:
          'https://www.alibaba.com/product-detail/commercial-gas-cooker.html',
        unitPrice: 58000,
        moq: 10,
        productCost: 696000,
        freightEstimate: 185000,
        serviceFee: 88000,
        totalCost: 969000,
        leadTime: '18–22 days after payment',
        isAlternative: false,
        status: 'sent',
        createdAt: new Date('2026-09-06T16:05:00.000Z'),
      },
      {
        id: 'quote_1038_alt',
        requestId: 'req_quoted',
        agentId: 'ops_admin',
        supplierRef: 'https://detail.1688.com/offer/gas-range-alt.html',
        unitPrice: 51000,
        moq: 12,
        productCost: 612000,
        freightEstimate: 170000,
        serviceFee: 78000,
        totalCost: 860000,
        leadTime: '25–30 days after payment',
        isAlternative: true,
        status: 'sent',
        createdAt: new Date('2026-09-06T16:06:00.000Z'),
      },
      {
        id: 'quote_1019',
        requestId: 'req_paid',
        agentId: 'ops_chioma',
        supplierRef: 'Factory GZ-882 (WeChat: factory882)',
        unitPrice: 28500,
        moq: 50,
        productCost: 2280000,
        freightEstimate: 410000,
        serviceFee: 185000,
        totalCost: 2875000,
        leadTime: '14 days production + freight',
        isAlternative: false,
        status: 'accepted',
        createdAt: new Date('2026-08-22T11:10:00.000Z'),
      },
      {
        id: 'quote_1004',
        requestId: 'req_delivered',
        agentId: 'ops_admin',
        supplierRef: 'https://detail.1688.com/offer/example.html',
        unitPrice: 22000,
        moq: 20,
        productCost: 880000,
        freightEstimate: 195000,
        serviceFee: 95000,
        totalCost: 1170000,
        leadTime: '21 days',
        isAlternative: false,
        status: 'accepted',
        createdAt: new Date('2026-07-28T13:00:00.000Z'),
      },
    ],
  });

  await prisma.payment.createMany({
    data: [
      {
        id: 'pay_1019',
        requestId: 'req_paid',
        amount: 2875000,
        gateway: 'paystack',
        gatewayRef: 'PSK_MOCK_1019',
        status: 'paid',
        paidAt: new Date('2026-08-23T09:44:00.000Z'),
      },
      {
        id: 'pay_1004',
        requestId: 'req_delivered',
        amount: 1170000,
        gateway: 'flutterwave',
        gatewayRef: 'FLW_MOCK_1004',
        status: 'paid',
        paidAt: new Date('2026-07-29T08:15:00.000Z'),
      },
    ],
  });

  await prisma.statusUpdate.createMany({
    data: [
      {
        id: 'hist_1042_1',
        requestId: 'req_submitted',
        status: 'submitted',
        note: 'Request received.',
        updatedBy: 'system',
        createdAt: new Date('2026-09-08T08:12:00.000Z'),
      },
      {
        id: 'hist_1038_1',
        requestId: 'req_quoted',
        status: 'submitted',
        note: 'Request received.',
        updatedBy: 'system',
        createdAt: new Date('2026-09-02T14:40:00.000Z'),
      },
      {
        id: 'hist_1038_2',
        requestId: 'req_quoted',
        status: 'quoted',
        note: 'Primary quote plus one close alternative.',
        updatedBy: 'ops_admin',
        createdAt: new Date('2026-09-06T16:06:00.000Z'),
      },
      {
        id: 'hist_1019_1',
        requestId: 'req_paid',
        status: 'submitted',
        note: 'Request received.',
        updatedBy: 'system',
        createdAt: new Date('2026-08-18T10:00:00.000Z'),
      },
      {
        id: 'hist_1019_2',
        requestId: 'req_paid',
        status: 'quoted',
        note: 'Exact-finish alternative sourced from GZ-882.',
        updatedBy: 'ops_chioma',
        createdAt: new Date('2026-08-22T11:10:00.000Z'),
      },
      {
        id: 'hist_1019_3',
        requestId: 'req_paid',
        status: 'approved_paid',
        note: 'Payment confirmed via Paystack.',
        updatedBy: 'system',
        createdAt: new Date('2026-08-23T09:44:00.000Z'),
      },
      {
        id: 'hist_1019_4',
        requestId: 'req_paid',
        status: 'procured',
        note: 'Factory confirmed production start.',
        updatedBy: 'ops_chioma',
        createdAt: new Date('2026-08-26T12:00:00.000Z'),
      },
      {
        id: 'hist_1019_5',
        requestId: 'req_paid',
        status: 'in_transit_china_warehouse',
        note: 'Goods received in Shenzhen warehouse.',
        updatedBy: 'ops_chioma',
        createdAt: new Date('2026-09-01T07:20:00.000Z'),
      },
      {
        id: 'hist_1019_6',
        requestId: 'req_paid',
        status: 'in_transit_freight',
        note: 'Consolidated and handed to freight.',
        updatedBy: 'ops_chioma',
        createdAt: new Date('2026-09-04T15:30:00.000Z'),
      },
      {
        id: 'hist_1004_1',
        requestId: 'req_delivered',
        status: 'submitted',
        note: 'Request received.',
        updatedBy: 'system',
        createdAt: new Date('2026-07-20T09:30:00.000Z'),
      },
      {
        id: 'hist_1004_2',
        requestId: 'req_delivered',
        status: 'quoted',
        note: 'Quote sent.',
        updatedBy: 'ops_admin',
        createdAt: new Date('2026-07-28T13:00:00.000Z'),
      },
      {
        id: 'hist_1004_3',
        requestId: 'req_delivered',
        status: 'approved_paid',
        note: 'Payment confirmed.',
        updatedBy: 'system',
        createdAt: new Date('2026-07-29T08:15:00.000Z'),
      },
      {
        id: 'hist_1004_4',
        requestId: 'req_delivered',
        status: 'procured',
        note: 'Goods purchased.',
        updatedBy: 'ops_admin',
        createdAt: new Date('2026-08-04T10:00:00.000Z'),
      },
      {
        id: 'hist_1004_5',
        requestId: 'req_delivered',
        status: 'in_transit_china_warehouse',
        note: 'At China warehouse.',
        updatedBy: 'ops_admin',
        createdAt: new Date('2026-08-10T10:00:00.000Z'),
      },
      {
        id: 'hist_1004_6',
        requestId: 'req_delivered',
        status: 'in_transit_freight',
        note: 'On the water.',
        updatedBy: 'ops_admin',
        createdAt: new Date('2026-08-12T10:00:00.000Z'),
      },
      {
        id: 'hist_1004_7',
        requestId: 'req_delivered',
        status: 'arrived_nigeria_warehouse',
        note: 'Cleared into Lagos warehouse.',
        updatedBy: 'ops_admin',
        createdAt: new Date('2026-08-28T10:00:00.000Z'),
      },
      {
        id: 'hist_1004_8',
        requestId: 'req_delivered',
        status: 'delivered',
        note: 'Handed to the customer in Ikeja.',
        updatedBy: 'ops_admin',
        createdAt: new Date('2026-08-30T14:20:00.000Z'),
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        id: 'ntf_1038',
        requestId: 'req_quoted',
        channel: 'whatsapp',
        message: 'Your quote for CP-1038 is ready to review.',
        createdAt: new Date('2026-09-06T16:07:00.000Z'),
      },
      {
        id: 'ntf_1019',
        requestId: 'req_paid',
        channel: 'whatsapp',
        message: 'CP-1019 is on its way from China.',
        createdAt: new Date('2026-09-04T15:31:00.000Z'),
      },
      {
        id: 'ntf_1004',
        requestId: 'req_delivered',
        channel: 'sms',
        message: 'CP-1004 has been delivered.',
        createdAt: new Date('2026-08-30T14:21:00.000Z'),
      },
    ],
  });

  await prisma.$executeRawUnsafe(
    `SELECT setval('request_reference_seq', 1042, true)`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
