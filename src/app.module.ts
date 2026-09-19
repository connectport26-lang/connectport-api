import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { OriginCsrfGuard } from './common/guards/origin-csrf.guard';
import { OpsAdminGuard } from './common/guards/ops-admin.guard';
import { OpsGuard } from './common/guards/ops.guard';
import { RequesterGuard } from './common/guards/requester.guard';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { MetricsInterceptor } from './observability/metrics.interceptor';
import { OpsConsoleModule } from './ops-console/ops-console.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';
import { RequestsModule } from './requests/requests.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    RedisModule,
    QueueModule,
    MailModule,
    HealthModule,
    AuthModule,
    RequestsModule,
    PaymentsModule,
    UploadsModule,
    ProductsModule,
    OpsConsoleModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginCsrfGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RequesterGuard },
    { provide: APP_GUARD, useClass: OpsGuard },
    { provide: APP_GUARD, useClass: OpsAdminGuard },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
