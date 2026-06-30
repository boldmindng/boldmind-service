export function validateDatabaseEnvVars(): { valid: boolean; missing: string[] } {
  const required = [
    'DATABASE_URL',
    'MONGODB_URL',
    'MONGODB_DB_MAIN',
    // Three-instance Redis split — see src/database/redis.service.ts
    'REDIS_SESSION_URL',
    'REDIS_QUEUE_URL',
    'REDIS_CACHE_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'PAYSTACK_SECRET_KEY',
  ];
  const missing = required.filter((v) => !process.env[v]);
  return { valid: missing.length === 0, missing };
}
