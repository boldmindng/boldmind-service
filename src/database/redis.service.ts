import {
  Injectable,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

/**
 * RedisService — Three-instance split architecture
 * ─────────────────────────────────────────────────────────────────────────────
 * SESSION  → SSO relay tokens, JWT refresh family revocation, OTP codes,
 *            rate-limit counters, feature flags
 *            Recommended config: AOF persistence, noeviction policy
 *            env: REDIS_SESSION_URL
 *
 * QUEUE    → BullMQ exclusively — passed to BullModule.forRootAsync()
 *            NEVER share this instance with session or cache data.
 *            Recommended config: RDB persistence, noeviction policy
 *            env: REDIS_QUEUE_URL
 *
 * CACHE    → ALOC exam questions, exchange rates, trend data, computed stats
 *            Recommended config: allkeys-lru eviction, no persistence
 *            env: REDIS_CACHE_URL
 *
 * Key naming convention:
 *   session  →  sso:relay:{token}       TTL 60s
 *               revoked:{tokenId}       TTL 30d
 *               ratelimit:{ep}:{uid}    TTL window
 *               otp:{purpose}:{email}   TTL 15m
 *               flags:{userId}          TTL 5m
 *
 *   cache    →  aloc:{sub}:{type}:{yr}  TTL 24h
 *               remit:rates:{ccy}       TTL 1h
 *               trends:ng:{date}        TTL 2h
 *               admin:stats:{date}      TTL 15m
 *               planai:access:{uid}     TTL 5m
 *
 * IMPORTANT — BullMQ wiring:
 *   BullModule.forRootAsync() in app.module.ts must inject RedisService
 *   and pass redis.queue as the connection. Never pass session or cache.
 *   Clients are created synchronously in the constructor so BullModule
 *   receives a valid (connecting) client, not undefined.
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  /** Auth, SSO, OTP, rate-limit — AOF persistence, noeviction */
  public readonly session: Redis;

  /** BullMQ only — RDB persistence, noeviction */
  public readonly queue: Redis;

  /** Short-lived computed data — allkeys-lru, no persistence */
  public readonly cache: Redis;

  constructor(private readonly config: ConfigService) {
    // Clients are created synchronously so BullModule.forRootAsync receives
    // a valid (connecting) client immediately, eliminating the race condition
    // that occurred with lazyConnect + async onModuleInit.
    this.session = this.createClient('REDIS_SESSION_URL', 'session', {
      maxRetriesPerRequest: null, // required by BullMQ; harmless for session
      enableReadyCheck: false,
    });

    this.queue = this.createClient('REDIS_QUEUE_URL', 'queue', {
      maxRetriesPerRequest: null, // BullMQ requirement — do not change
      enableReadyCheck: false,
    });

    this.cache = this.createClient('REDIS_CACHE_URL', 'cache', {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
    });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing Redis connections...');
    const results = await Promise.allSettled([
      this.session.quit(),
      this.queue.quit(),
      this.cache.quit(),
    ]);
    results.forEach((r, i) => {
      const label = ['session', 'queue', 'cache'][i];
      if (r.status === 'rejected') {
        this.logger.warn(`Redis [${label}] quit error: ${r.reason}`);
      }
    });
    this.logger.log('Redis connections closed');
  }

  // ─── Client factory ─────────────────────────────────────────────────────────

  private createClient(
    envKey: string,
    label: string,
    extraOptions: Partial<RedisOptions>,
  ): Redis {
    let url = this.config.getOrThrow<string>(envKey);

    // Strip shell-style flags that may have crept into env values, e.g. "-u redis://..."
    if (url.includes(' ')) {
      const match = url.match(/redis[s]?:\/\/\S+/);
      url = match?.[0] ?? url;
    }

    const isTls = url.startsWith('rediss://');

    const options: RedisOptions = {
      // Exponential backoff: 200ms → 400ms → ... → 5s, then stops
      retryStrategy: (times: number) => {
        if (times > 20) {
          this.logger.error(
            `Redis [${label}] gave up after ${times} retries. Check ${envKey} and ensure Redis is reachable.`,
          );
          return null; // stops retrying; ioredis emits 'end' event
        }
        const delay = Math.min(200 * 2 ** (times - 1), 5_000);
        this.logger.warn(`Redis [${label}] retry #${times} in ${delay}ms`);
        return delay;
      },
      reconnectOnError: (err: Error) => {
        // Reconnect on replica-promotion READONLY errors (managed Redis clusters)
        if (err.message.includes('READONLY')) {
          this.logger.warn(`Redis [${label}] READONLY — triggering reconnect`);
          return true;
        }
        return false;
      },
      // TLS for rediss:// — self-signed certs are common on Railway/Render
      ...(isTls
        ? {
            tls: {
              rejectUnauthorized:
                this.config.get<string>('NODE_ENV') === 'production',
            },
          }
        : {}),
      ...extraOptions,
    };

    const client = new Redis(url, options);

    client.on('connect', () =>
      this.logger.log(`Redis [${label}] TCP connected`),
    );
    client.on('ready', () =>
      this.logger.log(`Redis [${label}] ready ✅`),
    );
    client.on('error', (err: Error) =>
      this.logger.error(`Redis [${label}] error: ${err.message}`),
    );
    client.on('close', () =>
      this.logger.warn(`Redis [${label}] connection closed`),
    );
    client.on('reconnecting', () =>
      this.logger.warn(`Redis [${label}] reconnecting...`),
    );
    client.on('end', () =>
      this.logger.error(
        `Redis [${label}] connection ended — no more retries. Restart the service.`,
      ),
    );

    return client;
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
    if (keys.length === 0) return;
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

  async ttl(key: string): Promise<number> {
    return this.session.ttl(key);
  }

  // ─── Hash helpers (session) ─────────────────────────────────────────────────

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.session.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.session.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.session.hgetall(key) as Promise<Record<string, string>>;
  }

  async hdel(key: string, field: string): Promise<void> {
    await this.session.hdel(key, field);
  }

  /**
   * SCAN-based key listing — safe for production (avoids blocking KEYS in prod).
   * Only use KEYS in dev/test environments. This method always scans.
   */
  async scanKeys(pattern: string): Promise<string[]> {
    const found: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await this.session.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      found.push(...batch);
      cursor = nextCursor;
    } while (cursor !== '0');
    return found;
  }

  /**
   * @deprecated Use scanKeys() in production — KEYS blocks the Redis event loop.
   * Kept for dev-only scripts and backwards compatibility.
   */
  async keys(pattern: string): Promise<string[]> {
    return this.session.keys(pattern);
  }

  // ─── SSO relay tokens (session) ─────────────────────────────────────────────
  // Key pattern: sso:relay:{64-hex}   TTL: 60s (one-time use)

  async storeSSOToken(
    token: string,
    userId: string,
    ttlSeconds = 60,
  ): Promise<void> {
    await this.session.setex(`sso:relay:${token}`, ttlSeconds, userId);
  }

  /**
   * Atomically GET then DEL the SSO relay token.
   * Returns userId if token was valid and unused, null otherwise.
   * Lua guarantees atomicity — prevents double-use even under race conditions.
   */
  async consumeSSOToken(token: string): Promise<string | null> {
    const key = `sso:relay:${token}`;
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
    await this.session.setex(`revoked:${tokenId}`, ttlSeconds, '1');
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

  /**
   * Sliding-window rate limit using INCR + EXPIRE.
   * Thread-safe: INCR is atomic; EXPIRE only fires on first increment.
   */
  async checkRateLimit(
    key: string,
    limit: number,
    windowSecs: number,
  ): Promise<{ allowed: boolean; remaining: number; current: number }> {
    const current = await this.session.incr(key);
    if (current === 1) {
      // Only set TTL on first hit to avoid resetting the window on every request
      await this.session.expire(key, windowSecs);
    }
    return {
      allowed: current <= limit,
      remaining: Math.max(0, limit - current),
      current,
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
  // Methods are explicitly prefixed with "cache" to prevent confusion with
  // session ops. The CACHE instance uses allkeys-lru — any key can be evicted.
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
   * withCache<T> — read-through cache helper.
   *
   * On cache hit  → returns parsed JSON immediately.
   * On cache miss → calls fetchFn(), stores JSON, returns result.
   *
   * @example
   *   const questions = await redis.withCache(
   *     `aloc:maths:JAMB:2025`,
   *     () => alocService.fetchQuestions('maths', 'JAMB', 2025),
   *     86_400,  // 24h
   *   );
   */
  async withCache<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds = 300,
  ): Promise<T> {
    const cached = await this.cache.get(key);
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }
    const data = await fetchFn();
    // Fire-and-forget the cache write — don't block the response on it
    this.cache
      .setex(key, ttlSeconds, JSON.stringify(data))
      .catch((err: Error) =>
        this.logger.warn(`withCache setex failed for "${key}": ${err.message}`),
      );
    return data;
  }

  /**
   * @deprecated Use withCache() — same signature, clearer name.
   */
  async cachet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds = 300,
  ): Promise<T> {
    return this.withCache(key, fetchFn, ttlSeconds);
  }

  // ─── Typed cache helpers ────────────────────────────────────────────────────

  /** ALOC question cache — Key: aloc:{subject}:{examType}:{year}  TTL: 24h */
  async getAlocQuestions(
    subject: string,
    examType: string,
    year: number | 'all',
  ): Promise<unknown[] | null> {
    const raw = await this.cache.get(`aloc:${subject}:${examType}:${year}`);
    return raw ? (JSON.parse(raw) as unknown[]) : null;
  }

  async setAlocQuestions(
    subject: string,
    examType: string,
    year: number | 'all',
    questions: unknown[],
  ): Promise<void> {
    await this.cache.setex(
      `aloc:${subject}:${examType}:${year}`,
      86_400,
      JSON.stringify(questions),
    );
  }

  /** Exchange rate cache — Key: remit:rates:{currency}  TTL: 1h */
  async getExchangeRate(currency: string): Promise<unknown | null> {
    const raw = await this.cache.get(`remit:rates:${currency}`);
    return raw ? JSON.parse(raw) : null;
  }

  async setExchangeRate(currency: string, data: unknown): Promise<void> {
    await this.cache.setex(
      `remit:rates:${currency}`,
      3_600,
      JSON.stringify(data),
    );
  }

  /** Nigerian trend data cache — Key: trends:ng:{YYYY-MM-DD}  TTL: 2h */
  async getTrends(date: string): Promise<unknown | null> {
    const raw = await this.cache.get(`trends:ng:${date}`);
    return raw ? JSON.parse(raw) : null;
  }

  async setTrends(date: string, data: unknown): Promise<void> {
    await this.cache.setex(`trends:ng:${date}`, 7_200, JSON.stringify(data));
  }

  /** PlanAI tool access map per user — Key: planai:access:{userId}  TTL: 5m */
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

  /** Admin dashboard stats — Key: admin:stats:{YYYY-MM-DD}  TTL: 15m */
  async getAdminStats(date: string): Promise<unknown | null> {
    const raw = await this.cache.get(`admin:stats:${date}`);
    return raw ? JSON.parse(raw) : null;
  }

  async setAdminStats(date: string, data: unknown): Promise<void> {
    await this.cache.setex(
      `admin:stats:${date}`,
      900,
      JSON.stringify(data),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH CHECK
  // Called by GET /health (health.controller.ts)
  // ═══════════════════════════════════════════════════════════════════════════

  async health(): Promise<{
    session: 'up' | 'down';
    queue: 'up' | 'down';
    cache: 'up' | 'down';
  }> {
    const ping = async (client: Redis): Promise<'up' | 'down'> => {
      try {
        const pong = await client.ping();
        return pong === 'PONG' ? 'up' : 'down';
      } catch {
        return 'down';
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