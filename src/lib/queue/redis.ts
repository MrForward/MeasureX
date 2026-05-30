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

export const redis =
    globalForRedis.redis ??
    new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

if (process.env.NODE_ENV !== 'production') {
    globalForRedis.redis = redis;
}
