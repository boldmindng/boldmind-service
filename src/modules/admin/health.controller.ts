import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { PrismaService } from "../../database/prisma.service";
import { RedisService } from "../../database/redis.service";
import { Public } from "../../common/decorators/public.decorator";

@ApiTags("Health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Railway healthcheck — returns 200 if healthy" })
  async check() {
    const checks: Record<
      string,
      { status: string; latencyMs?: number; error?: string }
    > = {};

    const pgStart = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.postgres = { status: "ok", latencyMs: Date.now() - pgStart };
    } catch (err: any) {
      checks.postgres = { status: "error", error: err.message };
    }

    // RedisService exposes three separate ioredis instances (session/queue/cache)
    // per the Redis split architecture — there is no top-level .get()/.set().
    // Ping all three so a single-instance outage is caught.
    const redisStart = Date.now();
    try {
      await this.redis.cache.setex("health:ping", 5, "1");
      await this.redis.cache.get("health:ping");
      await this.redis.session.ping();
      await this.redis.queue.ping();
      checks.redis = { status: "ok", latencyMs: Date.now() - redisStart };
    } catch (err: any) {
      checks.redis = { status: "error", error: err.message };
    }

    const allOk = Object.values(checks).every((c) => c.status === "ok");

    return {
      status: allOk ? "ok" : "degraded",
      uptime: Math.floor(process.uptime()),
      database: checks.postgres,
      redis: checks.redis,
      service: "boldmind-api",
      version: process.env.npm_package_version || "1.0.0",
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get("ping")
  @ApiOperation({ summary: "Simple ping — no DB check" })
  ping() {
    return { pong: true, ts: Date.now() };
  }
}
