import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { BullModule } from "@nestjs/bullmq";

// Database
import { DatabaseModule } from "./database/database.module";
import { RedisService } from "./database/redis.service";

// Queues — single registration point for every BullMQ queue in the app
import { QueuesModule } from "./common/queues/queues.module";   // ← ADD

// Feature modules
import { AuthModule } from "./modules/auth/auth.module";
import { UserModule } from "./modules/user/user.module";
import { PaymentModule } from "./modules/payment/payment.module";
import { AiModule } from "./modules/ai/ai.module";
import { PlanAIModule } from "./modules/planai/planai.module";
import { ContentModule } from "./modules/amebogist/amebogist.module";
import { EduCenterModule } from "./modules/educenter/educenter.module";
import { AutomationModule } from "./modules/automation/automation.module";
import { MediaModule } from "./modules/media/media.module";
import { NotificationModule } from "./modules/notification/notification.module";
import { AdminModule } from "./modules/admin/admin.module";
import { HubModule } from "./modules/hub/hub.module";
import { VillageCircleModule } from "./modules/villagecircle/villagecircle.module";
import { WalletModule } from "./modules/wallet/wallet.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
      cache: true,
    }),

    DatabaseModule,

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          { name: "short", ttl: 1000, limit: 10 },
          { name: "medium", ttl: 60000, limit: 200 },
          { name: "long", ttl: 3600000, limit: 2000 },
        ],
      }),
    }),

    ScheduleModule.forRoot(),

    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: ".",
      maxListeners: 20,
    }),

    // ── Single BullMQ root — shared connection for every queue in the app ───
    BullModule.forRootAsync({
      imports: [DatabaseModule],
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        connection: redis.queue,
        defaultJobOptions: {
          removeOnComplete: { count: 1000 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      }),
    }),

    // ── Every queue, registered exactly once ─────────────────────────────────
    QueuesModule,   // ← ADD — must come after BullModule.forRootAsync

    // ── Feature Modules ───────────────────────────────────────────────────────
    AuthModule,
    UserModule,
    PaymentModule,
    AiModule,
    PlanAIModule,
    ContentModule,
    EduCenterModule,
    AutomationModule,
    MediaModule,
    NotificationModule,
    AdminModule,
    HubModule,
    VillageCircleModule,
    WalletModule,
  ],
})
export class AppModule {}