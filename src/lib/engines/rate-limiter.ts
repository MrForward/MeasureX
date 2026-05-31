import type { EngineId } from '@/types';
import type { RateLimitConfig } from './types';

/**
 * Sliding-window rate limiter for a single engine.
 *
 * Keeps a list of call timestamps and enforces a per-minute request cap.
 * The window is always the last 60 seconds relative to "now", so old calls
 * naturally fall out as time advances — no fixed reset boundary.
 *
 * Validates: Requirement 20.5 (per-engine rate limiting respecting provider quotas)
 */
export class RateLimiter {
    /** Timestamps (ms) of calls made within the current sliding window. */
    private readonly callTimestamps: number[] = [];

    /** Duration of the sliding window in milliseconds (always 60 seconds). */
    private static readonly WINDOW_MS = 60_000;

    constructor(private readonly limits: RateLimitConfig) { }

    /**
     * Removes timestamps that have fallen outside the 60-second window.
     * Must be called before any check to keep the list accurate.
     */
    private evictExpired(now: number): void {
        const cutoff = now - RateLimiter.WINDOW_MS;
        // Remove from the front while the oldest entry is outside the window.
        while (this.callTimestamps.length > 0 && this.callTimestamps[0] <= cutoff) {
            this.callTimestamps.shift();
        }
    }

    /**
     * Returns true if a new call can proceed right now without exceeding the
     * per-minute limit.
     */
    canProceed(): boolean {
        const now = Date.now();
        this.evictExpired(now);
        return this.callTimestamps.length < this.limits.requestsPerMinute;
    }

    /**
     * Records that a call was made at the current moment.
     * Call this immediately after a successful (or attempted) engine call.
     */
    recordCall(): void {
        this.callTimestamps.push(Date.now());
    }

    /**
     * Returns the number of milliseconds to wait before the next call is
     * allowed.  Returns 0 if a call can proceed immediately.
     *
     * When at the limit the oldest call in the window will be the first to
     * expire; we wait until it slides out of the 60-second window.
     */
    getWaitTimeMs(): number {
        const now = Date.now();
        this.evictExpired(now);

        if (this.callTimestamps.length < this.limits.requestsPerMinute) {
            return 0;
        }

        // The oldest timestamp is callTimestamps[0].
        // It exits the window at: callTimestamps[0] + WINDOW_MS
        // We need to wait: (callTimestamps[0] + WINDOW_MS) - now
        const oldestTimestamp = this.callTimestamps[0];
        const waitMs = oldestTimestamp + RateLimiter.WINDOW_MS - now;

        // Guard against negative values (clock skew / eviction edge cases).
        return Math.max(0, waitMs);
    }

    /**
     * Waits until a call is allowed, records it, and returns the wait time in
     * milliseconds (0 if no wait was needed).
     */
    async waitAndProceed(): Promise<number> {
        const waitMs = this.getWaitTimeMs();

        if (waitMs > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
        }

        this.recordCall();
        return waitMs;
    }
}

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Manages one `RateLimiter` instance per engine so that each engine's quota
 * is tracked independently.
 *
 * Validates: Requirement 20.5 (per-engine rate limiting respecting provider quotas)
 */
export class EngineRateLimiterRegistry {
    private readonly limiters = new Map<EngineId, RateLimiter>();

    /**
     * Returns the existing `RateLimiter` for `engineId`, or creates a new one
     * using the supplied `limits` if none exists yet.
     *
     * Note: once a limiter is created for an engine the `limits` argument is
     * ignored on subsequent calls — the limiter retains its original config.
     * Use `reset()` to replace a limiter with new limits.
     */
    getOrCreate(engineId: EngineId, limits: RateLimitConfig): RateLimiter {
        let limiter = this.limiters.get(engineId);
        if (!limiter) {
            limiter = new RateLimiter(limits);
            this.limiters.set(engineId, limiter);
        }
        return limiter;
    }

    /**
     * Returns true if the engine can make a call right now.
     * Creates a limiter for the engine if one does not yet exist.
     */
    canProceed(engineId: EngineId, limits: RateLimitConfig): boolean {
        return this.getOrCreate(engineId, limits).canProceed();
    }

    /**
     * Waits until the engine can make a call, records it, and returns the
     * wait time in milliseconds.
     * Creates a limiter for the engine if one does not yet exist.
     */
    async waitAndProceed(engineId: EngineId, limits: RateLimitConfig): Promise<number> {
        return this.getOrCreate(engineId, limits).waitAndProceed();
    }

    /**
     * Removes the rate limiter for `engineId`.  The next call to `getOrCreate`
     * will create a fresh limiter with a clean call history.
     * Primarily useful in tests.
     */
    reset(engineId: EngineId): void {
        this.limiters.delete(engineId);
    }
}

/**
 * Singleton registry — import this in engine adapters and the scheduler to
 * share rate-limit state across the process.
 */
export const engineRateLimiterRegistry = new EngineRateLimiterRegistry();
