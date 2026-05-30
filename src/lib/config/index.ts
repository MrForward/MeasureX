import { db } from '@/lib/db';
import { CONFIG_DEFAULTS } from './defaults';

/**
 * Platform configuration system.
 *
 * Loads tunable parameters from the `platform_config` table with an in-memory
 * cache (60s TTL). Falls back to hardcoded defaults when a key is missing.
 *
 * This is the backbone of the "config over code" principle — every threshold,
 * limit, and weight can be changed at runtime without a redeploy.
 */

interface CacheEntry {
    value: unknown;
    fetchedAt: number;
}

class PlatformConfig {
    private cache = new Map<string, CacheEntry>();
    private readonly CACHE_TTL_MS = 60_000;

    private isStale(key: string): boolean {
        const entry = this.cache.get(key);
        if (!entry) return true;
        return Date.now() - entry.fetchedAt > this.CACHE_TTL_MS;
    }

    /**
     * Get a config value. Returns the database value if present, otherwise the
     * hardcoded default. The `defaultValue` arg overrides the registry default
     * when provided.
     */
    async get<T>(key: string, defaultValue?: T): Promise<T> {
        if (this.cache.has(key) && !this.isStale(key)) {
            return this.cache.get(key)!.value as T;
        }

        const fallback =
            defaultValue !== undefined
                ? defaultValue
                : (CONFIG_DEFAULTS[key]?.value as T);

        try {
            const row = await db.platformConfig.findUnique({ where: { key } });
            const value = (row?.value ?? fallback) as T;
            this.cache.set(key, { value, fetchedAt: Date.now() });
            return value;
        } catch {
            // DB unavailable — use fallback, don't crash
            return fallback;
        }
    }

    /**
     * Set a config value and invalidate the cache for that key.
     */
    async set(key: string, value: unknown, updatedBy: string): Promise<void> {
        await db.platformConfig.upsert({
            where: { key },
            update: { value: value as object, updatedBy, updatedAt: new Date() },
            create: {
                key,
                value: value as object,
                updatedBy,
                description: CONFIG_DEFAULTS[key]?.description,
                category: CONFIG_DEFAULTS[key]?.category,
            },
        });
        this.cache.delete(key);
    }

    /**
     * Clear the entire cache. Useful in tests or after a bulk config change.
     */
    clearCache(): void {
        this.cache.clear();
    }
}

export const config = new PlatformConfig();
