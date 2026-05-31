import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimitConfig } from './types';
import { EngineRateLimiterRegistry, RateLimiter, engineRateLimiterRegistry } from './rate-limiter';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A tight limit (3 req/min) that is easy to exhaust in tests. */
const TIGHT_LIMITS: RateLimitConfig = {
    requestsPerMinute: 3,
    requestsPerDay: 1000,
    cooldownMs: 1000,
};

/** Realistic OpenAI limits. */
const OPENAI_LIMITS: RateLimitConfig = {
    requestsPerMinute: 60,
    requestsPerDay: 10_000,
    cooldownMs: 1000,
};

/** Realistic Perplexity limits. */
const PERPLEXITY_LIMITS: RateLimitConfig = {
    requestsPerMinute: 50,
    requestsPerDay: 5_000,
    cooldownMs: 1000,
};

// ── RateLimiter ───────────────────────────────────────────────────────────────

/**
 * Validates: Requirement 20.5 (per-engine rate limiting respecting provider quotas)
 */
describe('RateLimiter', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ── canProceed ────────────────────────────────────────────────────────────

    describe('canProceed()', () => {
        it('returns true when no calls have been made (under limit)', () => {
            const limiter = new RateLimiter(TIGHT_LIMITS);
            expect(limiter.canProceed()).toBe(true);
        });

        it('returns true when call count is below the per-minute limit', () => {
            const limiter = new RateLimiter(TIGHT_LIMITS);
            // Record 2 calls — limit is 3, so still under
            limiter.recordCall();
            limiter.recordCall();
            expect(limiter.canProceed()).toBe(true);
        });

        it('returns false when call count equals the per-minute limit', () => {
            const limiter = new RateLimiter(TIGHT_LIMITS);
            // Fill up to the limit
            limiter.recordCall();
            limiter.recordCall();
            limiter.recordCall();
            expect(limiter.canProceed()).toBe(false);
        });

        it('returns true after old calls slide out of the 60-second window', () => {
            const limiter = new RateLimiter(TIGHT_LIMITS);
            // Fill the window
            limiter.recordCall();
            limiter.recordCall();
            limiter.recordCall();
            expect(limiter.canProceed()).toBe(false);

            // Advance time by 61 seconds — all calls are now outside the window
            vi.advanceTimersByTime(61_000);
            expect(limiter.canProceed()).toBe(true);
        });

        it('returns false when only some calls have slid out but count is still at limit', () => {
            const limiter = new RateLimiter(TIGHT_LIMITS);
            // Make 3 calls, then advance 30s, then make 0 more — still 3 in window
            limiter.recordCall();
            limiter.recordCall();
            limiter.recordCall();
            vi.advanceTimersByTime(30_000);
            // The 3 calls are still within the 60s window
            expect(limiter.canProceed()).toBe(false);
        });
    });

    // ── recordCall ────────────────────────────────────────────────────────────

    describe('recordCall()', () => {
        it('increments the effective call count', () => {
            const limiter = new RateLimiter(TIGHT_LIMITS);
            expect(limiter.canProceed()).toBe(true);

            limiter.recordCall();
            limiter.recordCall();
            limiter.recordCall();

            // Now at limit
            expect(limiter.canProceed()).toBe(false);
        });

        it('does not affect calls from a different limiter instance', () => {
            const limiterA = new RateLimiter(TIGHT_LIMITS);
            const limiterB = new RateLimiter(TIGHT_LIMITS);

            limiterA.recordCall();
            limiterA.recordCall();
            limiterA.recordCall();

            // limiterB is independent — still under limit
            expect(limiterB.canProceed()).toBe(true);
        });
    });

    // ── getWaitTimeMs ─────────────────────────────────────────────────────────

    describe('getWaitTimeMs()', () => {
        it('returns 0 when under the limit', () => {
            const limiter = new RateLimiter(TIGHT_LIMITS);
            expect(limiter.getWaitTimeMs()).toBe(0);
        });

        it('returns 0 when exactly one call below the limit', () => {
            const limiter = new RateLimiter(TIGHT_LIMITS);
            limiter.recordCall();
            limiter.recordCall();
            // 2 calls, limit is 3 → still under
            expect(limiter.getWaitTimeMs()).toBe(0);
        });

        it('returns a positive value when at the limit', () => {
            const limiter = new RateLimiter(TIGHT_LIMITS);
            limiter.recordCall();
            limiter.recordCall();
            limiter.recordCall();
            expect(limiter.getWaitTimeMs()).toBeGreaterThan(0);
        });

        it('returns approximately 60000ms when at limit and calls were just made', () => {
            const limiter = new RateLimiter(TIGHT_LIMITS);
            limiter.recordCall();
            limiter.recordCall();
            limiter.recordCall();
            // The oldest call was just made, so we need to wait ~60s
            const wait = limiter.getWaitTimeMs();
            // Allow a small tolerance for execution time
            expect(wait).toBeGreaterThan(59_900);
            expect(wait).toBeLessThanOrEqual(60_000);
        });

        it('decreases as time advances toward the window boundary', () => {
            const limiter = new RateLimiter(TIGHT_LIMITS);
            limiter.recordCall();
            limiter.recordCall();
            limiter.recordCall();

            const waitBefore = limiter.getWaitTimeMs();
            vi.advanceTimersByTime(10_000);
            const waitAfter = limiter.getWaitTimeMs();

            expect(waitAfter).toBeLessThan(waitBefore);
        });

        it('returns 0 after the window has fully elapsed', () => {
            const limiter = new RateLimiter(TIGHT_LIMITS);
            limiter.recordCall();
            limiter.recordCall();
            limiter.recordCall();

            vi.advanceTimersByTime(61_000);
            expect(limiter.getWaitTimeMs()).toBe(0);
        });
    });

    // ── waitAndProceed ────────────────────────────────────────────────────────

    describe('waitAndProceed()', () => {
        it('returns 0 and records the call when no wait is needed', async () => {
            const limiter = new RateLimiter(TIGHT_LIMITS);

            const waitMs = await limiter.waitAndProceed();

            expect(waitMs).toBe(0);
            // One call should now be recorded — fill the remaining 2 and check
            limiter.recordCall();
            limiter.recordCall();
            expect(limiter.canProceed()).toBe(false);
        });

        it('waits the correct amount when at the limit', async () => {
            const limiter = new RateLimiter(TIGHT_LIMITS);
            limiter.recordCall();
            limiter.recordCall();
            limiter.recordCall();

            const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

            const promise = limiter.waitAndProceed();
            await vi.runAllTimersAsync();
            const waitMs = await promise;

            // Should have waited a positive amount
            expect(waitMs).toBeGreaterThan(0);

            // setTimeout should have been called with the wait duration
            const timerCalls = setTimeoutSpy.mock.calls.map(([, ms]) => ms as number);
            expect(timerCalls.some((ms) => ms > 0)).toBe(true);
        });

        it('records the call after waiting so subsequent canProceed reflects it', async () => {
            const limiter = new RateLimiter(TIGHT_LIMITS);
            // Fill to limit - 1
            limiter.recordCall();
            limiter.recordCall();

            // waitAndProceed should succeed immediately and record the 3rd call
            const promise = limiter.waitAndProceed();
            await vi.runAllTimersAsync();
            await promise;

            // Now at limit
            expect(limiter.canProceed()).toBe(false);
        });
    });
});

// ── EngineRateLimiterRegistry ─────────────────────────────────────────────────

/**
 * Validates: Requirement 20.5 (per-engine rate limiting respecting provider quotas)
 */
describe('EngineRateLimiterRegistry', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('creates a new limiter for an engine that has not been seen before', () => {
        const registry = new EngineRateLimiterRegistry();
        const limiter = registry.getOrCreate('chatgpt', OPENAI_LIMITS);
        expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('returns the same limiter instance on subsequent calls for the same engine', () => {
        const registry = new EngineRateLimiterRegistry();
        const first = registry.getOrCreate('chatgpt', OPENAI_LIMITS);
        const second = registry.getOrCreate('chatgpt', OPENAI_LIMITS);
        expect(first).toBe(second);
    });

    it('creates separate limiters per engine (OpenAI does not affect Perplexity)', () => {
        const registry = new EngineRateLimiterRegistry();

        // Exhaust OpenAI's limit
        const openaiLimiter = registry.getOrCreate('chatgpt', TIGHT_LIMITS);
        openaiLimiter.recordCall();
        openaiLimiter.recordCall();
        openaiLimiter.recordCall();

        // Perplexity should still be able to proceed
        expect(registry.canProceed('perplexity', TIGHT_LIMITS)).toBe(true);
    });

    it('canProceed() returns true when engine is under limit', () => {
        const registry = new EngineRateLimiterRegistry();
        expect(registry.canProceed('chatgpt', OPENAI_LIMITS)).toBe(true);
    });

    it('canProceed() returns false when engine is at limit', () => {
        const registry = new EngineRateLimiterRegistry();
        const limiter = registry.getOrCreate('chatgpt', TIGHT_LIMITS);
        limiter.recordCall();
        limiter.recordCall();
        limiter.recordCall();

        expect(registry.canProceed('chatgpt', TIGHT_LIMITS)).toBe(false);
    });

    it('canProceed() delegates to the correct per-engine limiter', () => {
        const registry = new EngineRateLimiterRegistry();

        // Exhaust chatgpt
        const chatgptLimiter = registry.getOrCreate('chatgpt', TIGHT_LIMITS);
        chatgptLimiter.recordCall();
        chatgptLimiter.recordCall();
        chatgptLimiter.recordCall();

        // chatgpt is blocked, perplexity is not
        expect(registry.canProceed('chatgpt', TIGHT_LIMITS)).toBe(false);
        expect(registry.canProceed('perplexity', PERPLEXITY_LIMITS)).toBe(true);
        expect(registry.canProceed('google_ai', TIGHT_LIMITS)).toBe(true);
    });

    it('waitAndProceed() returns 0 when engine is under limit', async () => {
        const registry = new EngineRateLimiterRegistry();
        const promise = registry.waitAndProceed('chatgpt', OPENAI_LIMITS);
        await vi.runAllTimersAsync();
        const waitMs = await promise;
        expect(waitMs).toBe(0);
    });

    it('waitAndProceed() waits when engine is at limit', async () => {
        const registry = new EngineRateLimiterRegistry();
        const limiter = registry.getOrCreate('chatgpt', TIGHT_LIMITS);
        limiter.recordCall();
        limiter.recordCall();
        limiter.recordCall();

        const promise = registry.waitAndProceed('chatgpt', TIGHT_LIMITS);
        await vi.runAllTimersAsync();
        const waitMs = await promise;

        expect(waitMs).toBeGreaterThan(0);
    });

    it('reset() removes the limiter so a fresh one is created on next getOrCreate', () => {
        const registry = new EngineRateLimiterRegistry();
        const original = registry.getOrCreate('chatgpt', TIGHT_LIMITS);
        original.recordCall();
        original.recordCall();
        original.recordCall();
        expect(registry.canProceed('chatgpt', TIGHT_LIMITS)).toBe(false);

        registry.reset('chatgpt');

        // After reset a new limiter is created — call history is gone
        expect(registry.canProceed('chatgpt', TIGHT_LIMITS)).toBe(true);
        const fresh = registry.getOrCreate('chatgpt', TIGHT_LIMITS);
        expect(fresh).not.toBe(original);
    });

    it('reset() only affects the specified engine', () => {
        const registry = new EngineRateLimiterRegistry();

        // Exhaust both engines
        const chatgptLimiter = registry.getOrCreate('chatgpt', TIGHT_LIMITS);
        chatgptLimiter.recordCall();
        chatgptLimiter.recordCall();
        chatgptLimiter.recordCall();

        const perplexityLimiter = registry.getOrCreate('perplexity', TIGHT_LIMITS);
        perplexityLimiter.recordCall();
        perplexityLimiter.recordCall();
        perplexityLimiter.recordCall();

        // Reset only chatgpt
        registry.reset('chatgpt');

        expect(registry.canProceed('chatgpt', TIGHT_LIMITS)).toBe(true);
        expect(registry.canProceed('perplexity', TIGHT_LIMITS)).toBe(false);
    });
});

// ── Singleton export ──────────────────────────────────────────────────────────

describe('engineRateLimiterRegistry singleton', () => {
    afterEach(() => {
        // Clean up singleton state between tests
        engineRateLimiterRegistry.reset('chatgpt');
        engineRateLimiterRegistry.reset('perplexity');
        engineRateLimiterRegistry.reset('google_ai');
        vi.useRealTimers();
    });

    it('is an instance of EngineRateLimiterRegistry', () => {
        expect(engineRateLimiterRegistry).toBeInstanceOf(EngineRateLimiterRegistry);
    });

    it('maintains state across multiple imports (singleton behaviour)', () => {
        vi.useFakeTimers();
        const limiter = engineRateLimiterRegistry.getOrCreate('chatgpt', TIGHT_LIMITS);
        limiter.recordCall();

        // The same instance should reflect the recorded call
        expect(engineRateLimiterRegistry.getOrCreate('chatgpt', TIGHT_LIMITS)).toBe(limiter);
    });
});
