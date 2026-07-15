import { Injectable, OnModuleDestroy, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/**
 * RedisService — Three-instance split
 * ─────────────────────────────────────────────────────────────────────────────
 * SESSION  → SSO relay tokens, JWT refresh family revocation, OTP codes,
 *            rate-limit counters, feature flags
 *            env: REDIS_SESSION_URL
 *
 * QUEUE    → BullMQ exclusively (passed to BullModule.forRootAsync)
 *            env: REDIS_QUEUE_URL
 *
 * CACHE    → ALOC exam questions, exchange rates, trend data, computed stats
 *            eviction: allkeys-lru  |  no persistence
 *            env: REDIS_CACHE_URL
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INCIDENT FIX (2026-07-15) — clients connecting to 127.0.0.1:6379 instead of
 * the configured REDIS_*_URL hosts:
 *
 *   Root cause: clients were built inside an async `onModuleInit()` using
 *   `lazyConnect: true` + `await client.connect()`. Nest resolves
 *   `useFactory` dependency injection (e.g. BullModule.forRootAsync's
 *   `inject: [RedisService]` → `connection: redis.queue`) while constructing
 *   the provider graph — BEFORE any `onModuleInit()` lifecycle hook runs
 *   anywhere in the app. That meant `redis.queue` was still `undefined` at
 *   the moment BullMQ read it, so ioredis silently fell back to its
 *   hardcoded default of 127.0.0.1:6379.
 *
 *   Fix: build all three clients synchronously in the CONSTRUCTOR, not in
 *   onModuleInit. Nest always finishes running a provider's constructor
 *   before that provider can be injected anywhere else, so `session`,
 *   `queue`, and `cache` are guaranteed to be real Redis instances the
 *   moment any other factory or service asks for them. Connection itself is
 *   still async/non-blocking in the background (ioredis default
 *   `lazyConnect: false` connects immediately without blocking the
 *   constructor) — BullMQ, session ops, and cache ops all internally queue
 *   commands until the socket is ready, so this does not stall bootstrap.
 *
 *   Retained resilience characteristics from the prior incident fix:
 *     1. Exponential backoff w/ jitter, capped at 10s, never gives up.
 *     2. `family: 0` — Happy Eyeballs (IPv4 + IPv6) for Railway/Upstash
 *        endpoints that intermittently resolve unroutable AAAA records.
 *     3. `keepAlive: 30_000` — prevents managed-Redis load balancers from
 *        silently dropping idle sockets (which otherwise surfaces as a
 *        confusing ECONNRESET on the next command).
 *     4. `connectTimeout: 10_000` — bounds half-open TCP connects.
 *     5. `reconnectOnError` distinguishes READONLY/CLUSTERDOWN (retry) from
 *        NOAUTH/WRONGPASS (surface immediately, do not hot-loop).
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  /** Auth, SSO, OTP, rate-limit — persistence: AOF, policy: noeviction */
  public readonly session: Redis;

  /** BullMQ only — persistence: RDB, policy: noeviction */
  public readonly queue: Redis;

  /** Short-lived computed data — no persistence, policy: allkeys-lru */
  public readonly cache: Redis;

  /**
   * Resolves once all three clients have fired `ready`. Optional — nothing
   * in the DI graph needs to await this (commands are queued internally by
   * ioredis until ready), but main.ts can await it before calling
   * `app.listen()` if you want a hard guarantee before accepting traffic.
   */
  public readonly whenReady: Promise<void>;

  constructor(private readonly config: ConfigService) {
    this.session = this.createClient("REDIS_SESSION_URL", "session", {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.queue = this.createClient("REDIS_QUEUE_URL", "queue", {
      // Required by BullMQ — do not change.
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.cache = this.createClient("REDIS_CACHE_URL", "cache", {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
    });

    this.whenReady = Promise.all([
      this.onceReady(this.session, "session"),
      this.onceReady(this.queue, "queue"),
      this.onceReady(this.cache, "cache"),
    ]).then(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.session?.quit(),
      this.queue?.quit(),
      this.cache?.quit(),
    ]);
  }

  // ─── Private: client factory ────────────────────────────────────────────────

  private createClient(
    envKey: string,
    label: string,
    options: Record<string, unknown>,
  ): Redis {
    let url = this.config.getOrThrow<string>(envKey);

    // Strip CLI-style flags that may have crept into env values, e.g. "-u rediss://..."
    if (url.includes("-u ")) {
      url = url.split("-u ")[1].split(" ")[0];
    }
    url = url.trim();

    const tlsRequired =
      url.startsWith("rediss://") || url.includes(".upstash.io");

    let consecutiveFailures = 0;

    // lazyConnect intentionally omitted → defaults to false, so ioredis
    // starts connecting the instant this client is constructed. Commands
    // issued before the socket is ready are queued internally by ioredis,
    // so nothing needs to `await connect()` here.
    const client = new Redis(url, {
      ...options,
      ...(tlsRequired ? { tls: { rejectUnauthorized: false } } : {}),

      // ── Network resilience (fixes the ECONNRESET reconnect storm) ────────
      family: 0, // Happy Eyeballs — try IPv4 + IPv6, use whichever connects
      connectTimeout: 10_000, // bound hung half-open connects
      keepAlive: 30_000, // ping the TCP socket so LBs don't silently drop it
      noDelay: true,

      // Exponential backoff with jitter, capped at 10s. Never gives up —
      // BullMQ / session / cache all need eventual reconnection — but never
      // hot-loops in a way that trips upstream connection-rate limits.
      retryStrategy: (times: number) => {
        consecutiveFailures = times;
        const base = Math.min(times * 200, 10_000);
        const jitter = Math.floor(Math.random() * 300);
        const delay = base + jitter;

        if (times % 5 === 0) {
          this.logger.warn(
            `Redis [${label}] still reconnecting after ${times} attempts (next retry in ${delay}ms)`,
          );
        }
        return delay;
      },

      // Only auto-retry the failed command on errors that are genuinely
      // transient. Auth/permission errors should surface immediately
      // instead of hot-looping reconnect attempts against bad credentials.
      reconnectOnError: (err: Error) => {
        const msg = err.message || "";
        if (msg.includes("READONLY") || msg.includes("CLUSTERDOWN")) {
          return true;
        }
        if (msg.includes("NOAUTH") || msg.includes("WRONGPASS")) {
          this.logger.error(
            `Redis [${label}] auth error — check ${envKey}: ${msg}`,
          );
          return false;
        }
        return true;
      },
    });

    client.on("connect", () => {
      this.logger.log(`Redis [${label}] TCP connected`);
    });
    client.on("ready", () => {
      if (consecutiveFailures > 0) {
        this.logger.log(
          `Redis [${label}] ready after ${consecutiveFailures} retries — connection recovered`,
        );
      } else {
        this.logger.log(`Redis [${label}] ready`);
      }
      consecutiveFailures = 0;
    });
    client.on("error", (err) => {
      // ioredis emits an 'error' event per failed attempt — avoid duplicate
      // full-stack spam beyond what's useful; message is enough here.
      this.logger.error(`Redis [${label}] error: ${err.message}`);
    });
    client.on("close", () => {
      this.logger.warn(`Redis [${label}] connection closed`);
    });
    client.on("reconnecting", (delay: number) => {
      this.logger.debug?.(`Redis [${label}] reconnecting in ${delay}ms`);
    });
    client.on("end", () => {
      this.logger.error(
        `Redis [${label}] connection ended — no more automatic reconnects will occur`,
      );
    });

    return client;
  }

  private onceReady(client: Redis, label: string): Promise<void> {
    if (client.status === "ready") return Promise.resolve();
    return new Promise((resolve) => {
      client.once("ready", () => resolve());
      // Don't hang bootstrap forever if a single instance never comes up —
      // log and resolve anyway after 15s; the retryStrategy above keeps
      // trying in the background regardless.
      setTimeout(() => {
        if (client.status !== "ready") {
          this.logger.warn(
            `Redis [${label}] not ready after 15s — continuing bootstrap; retries continue in background`,
          );
        }
        resolve();
      }, 15_000);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION INSTANCE HELPERS
  // All helpers below use this.session unless the method name says "cache".
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Basic key ops (session) ────────────────────────────────────────────────

  async get(key: string): Promise<string | null> {
    return this.session.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.session.setex(key, ttlSeconds, value);
    } else {
      await this.session.set(key, value);
    }
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    await this.session.setex(key, ttlSeconds, value);
  }

  async del(...keys: string[]): Promise<void> {
    await this.session.del(...keys);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.session.exists(key)) === 1;
  }

  async incr(key: string): Promise<number> {
    return this.session.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.session.expire(key, ttlSeconds);
  }

  // ─── Hash helpers (session) ─────────────────────────────────────────────────

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.session.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.session.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.session.hgetall(key);
  }

  /**
   * SCAN-based key listing — avoids KEYS blocking the event loop on the
   * shared Redis instance under production load. Prefer this over `keys()`
   * for anything not run interactively at small scale.
   */
  async scanKeys(pattern: string, count = 100): Promise<string[]> {
    const found: string[] = [];
    let cursor = "0";
    do {
      const [nextCursor, batch] = await this.session.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        count,
      );
      cursor = nextCursor;
      found.push(...batch);
    } while (cursor !== "0");
    return found;
  }

  /** @deprecated Prefer scanKeys() — KEYS blocks the Redis event loop under load. */
  async keys(pattern: string): Promise<string[]> {
    return this.session.keys(pattern);
  }

  // ─── SSO relay tokens (session) ─────────────────────────────────────────────
  // Key pattern: sso:relay:{64-hex}   TTL: 60s (default)

  async storeSSOToken(
    token: string,
    userId: string,
    ttlSeconds = 60,
  ): Promise<void> {
    await this.session.setex(`sso:relay:${token}`, ttlSeconds, userId);
  }

  async consumeSSOToken(token: string): Promise<string | null> {
    const key = `sso:relay:${token}`;
    // Lua script: atomic get-then-delete (prevents double-use)
    const result = (await this.session.eval(
      `local v = redis.call("GET", KEYS[1])
       if v then redis.call("DEL", KEYS[1]) end
       return v`,
      1,
      key,
    )) as string | null;
    return result;
  }

  // ─── JWT refresh token revocation (session) ─────────────────────────────────
  // Key pattern: revoked:{tokenId}   TTL: 30 days

  async revokeRefreshToken(
    tokenId: string,
    ttlSeconds = 60 * 60 * 24 * 30,
  ): Promise<void> {
    await this.session.setex(`revoked:${tokenId}`, ttlSeconds, "1");
  }

  async isRefreshTokenRevoked(tokenId: string): Promise<boolean> {
    return (await this.session.exists(`revoked:${tokenId}`)) === 1;
  }

  // ─── OTP storage (session) ──────────────────────────────────────────────────
  // Key pattern: otp:{purpose}:{email|phone}   TTL: 15 min

  async storeOTP(
    purpose: string,
    recipient: string,
    hashedCode: string,
    ttlSeconds = 900,
  ): Promise<void> {
    await this.session.setex(
      `otp:${purpose}:${recipient}`,
      ttlSeconds,
      hashedCode,
    );
  }

  async getOTP(purpose: string, recipient: string): Promise<string | null> {
    return this.session.get(`otp:${purpose}:${recipient}`);
  }

  async deleteOTP(purpose: string, recipient: string): Promise<void> {
    await this.session.del(`otp:${purpose}:${recipient}`);
  }

  // ─── Rate limiting (session) ────────────────────────────────────────────────
  // Key pattern: ratelimit:{endpoint}:{userId|ip}

  async checkRateLimit(
    key: string,
    limit: number,
    windowSecs: number,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const current = await this.session.incr(key);
    if (current === 1) {
      await this.session.expire(key, windowSecs);
    }
    return {
      allowed: current <= limit,
      remaining: Math.max(0, limit - current),
    };
  }

  // ─── Feature flags (session) ────────────────────────────────────────────────
  // Key pattern: flags:{userId} | flags:global   TTL: 5 min

  async getFeatureFlags(
    userId: string,
  ): Promise<Record<string, string> | null> {
    const data = await this.session.get(`flags:${userId}`);
    return data ? (JSON.parse(data) as Record<string, string>) : null;
  }

  async setFeatureFlags(
    userId: string,
    flags: Record<string, string>,
    ttlSeconds = 300,
  ): Promise<void> {
    await this.session.setex(
      `flags:${userId}`,
      ttlSeconds,
      JSON.stringify(flags),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CACHE INSTANCE HELPERS
  // Explicitly namespaced as cacheGet / cacheSet to distinguish from session ops.
  // ═══════════════════════════════════════════════════════════════════════════

  async cacheGet(key: string): Promise<string | null> {
    return this.cache.get(key);
  }

  async cacheSet(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.cache.setex(key, ttlSeconds, value);
  }

  async cacheDel(key: string): Promise<void> {
    await this.cache.del(key);
  }

  /**
   * withCache<T>()
   * Read-through helper for the CACHE instance.
   * If key is warm, returns parsed JSON.
   * On miss, calls fetchFn, stores result, returns it.
   *
   * Usage:
   *   const questions = await redis.withCache(
   *     `aloc:maths:JAMB:2025`,
   *     () => alocService.fetchQuestions('maths', 'JAMB', 2025),
   *     86400,  // 24h
   *   );
   */
  async withCache<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds = 300,
  ): Promise<T> {
    const cached = await this.cache.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
    const data = await fetchFn();
    await this.cache.setex(key, ttlSeconds, JSON.stringify(data));
    return data;
  }

  /**
   * @deprecated Use withCache() instead.
   * Kept for backwards compatibility with any existing callers of cache().
   */
  async cachet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds = 300,
  ): Promise<T> {
    return this.withCache(key, fetchFn, ttlSeconds);
  }

  // ─── Named cache-key helpers (ALOC, rates, trends) ─────────────────────────

  /**
   * ALOC question cache.
   * Key: aloc:{subject}:{examType}:{year}   TTL: 24h
   */
  async getAlocQuestions(
    subject: string,
    examType: string,
    year: number | "all",
  ): Promise<unknown[] | null> {
    const raw = await this.cache.get(`aloc:${subject}:${examType}:${year}`);
    return raw ? (JSON.parse(raw) as unknown[]) : null;
  }

  async setAlocQuestions(
    subject: string,
    examType: string,
    year: number | "all",
    questions: unknown[],
  ): Promise<void> {
    await this.cache.setex(
      `aloc:${subject}:${examType}:${year}`,
      86400,
      JSON.stringify(questions),
    );
  }

  /**
   * Exchange rate cache.
   * Key: remit:rates:{currency}   TTL: 1h
   */
  async getExchangeRate(currency: string): Promise<unknown | null> {
    const raw = await this.cache.get(`remit:rates:${currency}`);
    return raw ? JSON.parse(raw) : null;
  }

  async setExchangeRate(currency: string, data: unknown): Promise<void> {
    await this.cache.setex(
      `remit:rates:${currency}`,
      3600,
      JSON.stringify(data),
    );
  }

  /**
   * Nigerian trend data cache.
   * Key: trends:ng:{YYYY-MM-DD}   TTL: 2h
   */
  async getTrends(date: string): Promise<unknown | null> {
    const raw = await this.cache.get(`trends:ng:${date}`);
    return raw ? JSON.parse(raw) : null;
  }

  async setTrends(date: string, data: unknown): Promise<void> {
    await this.cache.setex(`trends:ng:${date}`, 7200, JSON.stringify(data));
  }

  /**
   * PlanAI tool access map per user.
   * Key: planai:access:{userId}   TTL: 5 min
   */
  async getPlanAIAccess(userId: string): Promise<string[] | null> {
    const raw = await this.cache.get(`planai:access:${userId}`);
    return raw ? (JSON.parse(raw) as string[]) : null;
  }

  async setPlanAIAccess(userId: string, slugs: string[]): Promise<void> {
    await this.cache.setex(
      `planai:access:${userId}`,
      300,
      JSON.stringify(slugs),
    );
  }

  async invalidatePlanAIAccess(userId: string): Promise<void> {
    await this.cache.del(`planai:access:${userId}`);
  }

  /**
   * Admin dashboard stats.
   * Key: admin:stats:{YYYY-MM-DD}   TTL: 15 min
   */
  async getAdminStats(date: string): Promise<unknown | null> {
    const raw = await this.cache.get(`admin:stats:${date}`);
    return raw ? JSON.parse(raw) : null;
  }

  async setAdminStats(date: string, data: unknown): Promise<void> {
    await this.cache.setex(`admin:stats:${date}`, 900, JSON.stringify(data));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH CHECK
  // Used by GET /health (admin.module.ts health.controller.ts)
  // ═══════════════════════════════════════════════════════════════════════════

  async health(): Promise<{
    session: "up" | "down";
    queue: "up" | "down";
    cache: "up" | "down";
  }> {
    const ping = async (client: Redis): Promise<"up" | "down"> => {
      try {
        const pong = await client.ping();
        return pong === "PONG" ? "up" : "down";
      } catch {
        return "down";
      }
    };

    const [session, queue, cache] = await Promise.all([
      ping(this.session),
      ping(this.queue),
      ping(this.cache),
    ]);

    return { session, queue, cache };
  }
}
