import { Global, Module, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule, InjectConnection } from "@nestjs/mongoose";
import { Connection } from "mongoose";
import { PrismaService } from "./prisma.service";
import { RedisService } from "./redis.service";

/**
 * DatabaseModule — Global data-layer providers
 * ─────────────────────────────────────────────────────────────────────────────
 * Exports:
 *   PrismaService   → Neon PostgreSQL via Prisma 6
 *   RedisService    → Three-instance split (session / queue / cache)
 *   MongooseModule  → Root connection; feature modules register schemas via
 *                     MongooseModule.forFeature() in their own module file
 *
 * MongoDB connection settings are tuned for:
 *   - Railway hobby / Atlas M0 (maxPoolSize: 15)
 *   - Long-running Railway containers (heartbeat keep-alive)
 *   - Avoiding accidental index creation in production (autoIndex: false in prod)
 *
 * RedisService clients are created synchronously in the constructor so that
 * BullModule.forRootAsync() in app.module.ts receives a valid (connecting)
 * Redis client immediately — this eliminates the race condition that caused
 * "Worker requires a connection" errors when using lazyConnect + onModuleInit.
 * ─────────────────────────────────────────────────────────────────────────────
 * FIX (2026-07-15) — getRedisHealth() was hardcoded to always return "up" for
 * all three instances, regardless of actual connection state, so the
 * bootstrap log could claim Redis was healthy even when it wasn't. The
 * previous comment justifying this ("circular provider reference") doesn't
 * hold: RedisService is declared in this module's own `providers` array, and
 * a module class is free to constructor-inject any provider from its own
 * module — that's not a cycle. Injected RedisService directly and delegated
 * to its real health() ping below.
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Global()
@Module({
  imports: [
    // ── MongoDB / Mongoose ──────────────────────────────────────────────────
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>("MONGODB_URL");
        if (!uri) {
          throw new Error(
            "MONGODB_URL is not set. " +
              "Add it to .env — format: mongodb+srv://user:pass@cluster/db",
          );
        }

        // Explicit DB name wins; falls back to what is embedded in the URI
        const dbName =
          config.get<string>("MONGODB_DB_MAIN") ??
          config.get<string>("MONGODB_DB_NAME") ??
          "boldmind";

        const isProd = config.get<string>("NODE_ENV") === "production";

        return {
          uri,
          dbName,

          // Connection pool — safe upper bound for Railway + Atlas M0/M2
          maxPoolSize: 15,
          minPoolSize: 2,

          // Fail fast on bad credentials or unreachable cluster at startup
          serverSelectionTimeoutMS: 5_000,

          // Keep-alive so Railway doesn't kill idle connections between requests
          heartbeatFrequencyMS: 10_000,
          socketTimeoutMS: 45_000,

          // Retryable writes — safe for Atlas and most managed MongoDB providers
          retryWrites: true,

          // Never auto-index in production — run migrations explicitly
          autoIndex: !isProd,
          autoCreate: false,
        };
      },
    }),
  ],

  providers: [PrismaService, RedisService],

  // Export all three so any feature module can inject without re-importing DatabaseModule
  exports: [
    PrismaService,
    RedisService,
    MongooseModule, // enables Model<T> injection in feature modules
  ],
})
export class DatabaseModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(
    @InjectConnection() private readonly mongoConnection: Connection,
    private readonly redisService: RedisService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Log MongoDB connection state at startup
    const state = this.mongoConnection.readyState;
    const stateLabel =
      ["disconnected", "connected", "connecting", "disconnecting"][state] ??
      "unknown";

    if (state === 1) {
      this.logger.log(
        `✅ MongoDB connected — db="${this.mongoConnection.name}"`,
      );
    } else {
      this.logger.warn(
        `⚠️  MongoDB state at bootstrap: ${stateLabel} (${state})`,
      );
    }

    // Give the three Redis clients a bounded window to finish their initial
    // handshake (they started connecting the instant RedisService was
    // constructed, well before this hook fires) before pinging, so a normal
    // few-hundred-ms connect latency doesn't get logged as a false failure.
    await this.redisService.whenReady;

    const { session, queue, cache } = await this.redisService.health();

    const redisLine = [
      `session=${session}`,
      `queue=${queue}`,
      `cache=${cache}`,
    ].join(" | ");

    if (session === "up" && queue === "up" && cache === "up") {
      this.logger.log(`✅ Redis all instances ready — ${redisLine}`);
    } else {
      this.logger.error(
        `❌ Redis health check failed at bootstrap — ${redisLine}. ` +
          "Check REDIS_SESSION_URL / REDIS_QUEUE_URL / REDIS_CACHE_URL in .env",
      );
    }
  }
}
