import { Redis } from '@upstash/redis';

/**
 * Singleton Upstash Redis client.
 *
 * Mirrors the Prisma singleton pattern — prevents creating multiple connections
 * in development where Next.js hot-reload would otherwise instantiate a new
 * client on every module reload.
 *
 * Required env vars:
 *   UPSTASH_REDIS_REST_URL  — REST endpoint from the Upstash console
 *   UPSTASH_REDIS_REST_TOKEN — Read/write token from the Upstash console
 */

const globalForRedis = globalThis as unknown as {
    redis: Redis | undefined;
};

/** True when Upstash Redis credentials are present. */
const redisConfigured = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);

/**
 * Singleton Upstash Redis client — only constructed when credentials exist.
 * In local dev (no Upstash) this is `undefined`; the single consumer (the
 * kill-switch check in execute-job) treats an absent client as "not killed"
 * and fails open. Constructing `new Redis({url: undefined})` would throw at
 * import time, so we must not build it without credentials.
 */
export const redis: Redis | undefined =
    globalForRedis.redis ??
    (redisConfigured
        ? new Redis({
              url: process.env.UPSTASH_REDIS_REST_URL!,
              token: process.env.UPSTASH_REDIS_REST_TOKEN!,
          })
        : undefined);

if (process.env.NODE_ENV !== 'production' && redis) {
    globalForRedis.redis = redis;
}
