import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BaseEngineAdapter } from './base-adapter';
import {
    EngineError,
    EngineExecutionResult,
    EngineStatus,
    PromptInput,
    RateLimitConfig,
    StandardizedResponse,
    ExecutionContext,
} from './types';
import type { EngineId } from '@/types';

// ── Concrete test adapter ─────────────────────────────────────────────────────

class TestAdapter extends BaseEngineAdapter {
    readonly engineId: EngineId = 'chatgpt';
    readonly engineName = 'Test Engine';

    async execute(_prompt: PromptInput, _context?: ExecutionContext): Promise<EngineExecutionResult> {
        return { success: true, response: this._makeResponse() };
    }

    parseResponse(_raw: unknown): StandardizedResponse {
        return this._makeResponse();
    }

    getRateLimits(): RateLimitConfig {
        return { requestsPerMinute: 60, requestsPerDay: 1000, cooldownMs: 1000 };
    }

    getCostPerCall(): number {
        return 0.0015;
    }

    private _makeResponse(): StandardizedResponse {
        return {
            rawText: 'test',
            citations: [],
            metadata: {},
            modelVersion: 'test-v1',
            timestamp: new Date(),
            executionTimeMs: 100,
        };
    }

    // Expose protected state for assertions
    get _consecutiveFailures() { return this.consecutiveFailures; }
    get _circuitBreakerOpen() { return this.circuitBreakerOpen; }
    get _lastSuccessAt() { return this.lastSuccessAt; }
    get _lastFailureAt() { return this.lastFailureAt; }
    get _lastErrorMessage() { return this.lastErrorMessage; }
    get _circuitOpenedAt() { return this.circuitOpenedAt; }
}

function makeError(msg = 'test error'): EngineError {
    return new EngineError(msg, 'chatgpt', 'api_error', true);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BaseEngineAdapter — circuit breaker', () => {
    let adapter: TestAdapter;

    beforeEach(() => {
        adapter = new TestAdapter();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ── Initial state ─────────────────────────────────────────────────────────

    it('starts with circuit closed and zero failures', () => {
        expect(adapter.isCircuitOpen()).toBe(false);
        expect(adapter._consecutiveFailures).toBe(0);
        expect(adapter._circuitBreakerOpen).toBe(false);
    });

    it('getStatus reflects initial state', () => {
        const status: EngineStatus = adapter.getStatus();
        expect(status.available).toBe(true);
        expect(status.consecutiveFailures).toBe(0);
        expect(status.circuitBreakerOpen).toBe(false);
        expect(status.lastSuccessAt).toBeNull();
        expect(status.lastFailureAt).toBeNull();
        expect(status.lastErrorMessage).toBeNull();
    });

    // ── recordFailure ─────────────────────────────────────────────────────────

    it('increments consecutiveFailures on each recordFailure', () => {
        adapter.recordFailure(makeError());
        expect(adapter._consecutiveFailures).toBe(1);
        adapter.recordFailure(makeError());
        expect(adapter._consecutiveFailures).toBe(2);
    });

    it('stores lastFailureAt and lastErrorMessage on recordFailure', () => {
        const before = new Date();
        adapter.recordFailure(makeError('boom'));
        expect(adapter._lastFailureAt).not.toBeNull();
        expect(adapter._lastFailureAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(adapter._lastErrorMessage).toBe('boom');
    });

    it('does NOT open circuit before reaching the threshold (default 5)', () => {
        for (let i = 0; i < 4; i++) {
            adapter.recordFailure(makeError());
        }
        expect(adapter.isCircuitOpen()).toBe(false);
        expect(adapter._circuitBreakerOpen).toBe(false);
    });

    it('opens circuit after N consecutive failures (default threshold = 5)', () => {
        for (let i = 0; i < 5; i++) {
            adapter.recordFailure(makeError());
        }
        expect(adapter.isCircuitOpen()).toBe(true);
        expect(adapter._circuitBreakerOpen).toBe(true);
    });

    it('getStatus.available is false when circuit is open', () => {
        for (let i = 0; i < 5; i++) {
            adapter.recordFailure(makeError());
        }
        expect(adapter.getStatus().available).toBe(false);
        expect(adapter.getStatus().circuitBreakerOpen).toBe(true);
    });

    it('does not re-open an already-open circuit on additional failures', () => {
        for (let i = 0; i < 7; i++) {
            adapter.recordFailure(makeError());
        }
        // circuitOpenedAt should be set only once (at failure #5)
        expect(adapter._circuitBreakerOpen).toBe(true);
        expect(adapter._consecutiveFailures).toBe(7);
    });

    // ── recordSuccess ─────────────────────────────────────────────────────────

    it('recordSuccess resets consecutiveFailures to 0', () => {
        adapter.recordFailure(makeError());
        adapter.recordFailure(makeError());
        adapter.recordSuccess();
        expect(adapter._consecutiveFailures).toBe(0);
    });

    it('recordSuccess closes an open circuit', () => {
        for (let i = 0; i < 5; i++) {
            adapter.recordFailure(makeError());
        }
        expect(adapter.isCircuitOpen()).toBe(true);
        adapter.recordSuccess();
        expect(adapter.isCircuitOpen()).toBe(false);
        expect(adapter._circuitBreakerOpen).toBe(false);
    });

    it('recordSuccess sets lastSuccessAt', () => {
        const before = new Date();
        adapter.recordSuccess();
        expect(adapter._lastSuccessAt).not.toBeNull();
        expect(adapter._lastSuccessAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('getStatus.available is true after recordSuccess resets circuit', () => {
        for (let i = 0; i < 5; i++) {
            adapter.recordFailure(makeError());
        }
        adapter.recordSuccess();
        expect(adapter.getStatus().available).toBe(true);
    });

    // ── Auto-reset after pause duration ──────────────────────────────────────

    it('isCircuitOpen returns false after pause duration elapses', () => {
        // Open the circuit
        for (let i = 0; i < 5; i++) {
            adapter.recordFailure(makeError());
        }
        expect(adapter.isCircuitOpen()).toBe(true);

        // Advance time past the 30-minute pause (1_800_000 ms)
        vi.advanceTimersByTime(1_800_001);

        expect(adapter.isCircuitOpen()).toBe(false);
    });

    it('isCircuitOpen still returns true before pause duration elapses', () => {
        for (let i = 0; i < 5; i++) {
            adapter.recordFailure(makeError());
        }
        // Advance time but not past the threshold
        vi.advanceTimersByTime(1_799_999);
        expect(adapter.isCircuitOpen()).toBe(true);
    });

    it('auto-reset clears circuitBreakerOpen and consecutiveFailures', () => {
        for (let i = 0; i < 5; i++) {
            adapter.recordFailure(makeError());
        }
        vi.advanceTimersByTime(1_800_001);
        adapter.isCircuitOpen(); // trigger the auto-reset side-effect
        expect(adapter._circuitBreakerOpen).toBe(false);
        expect(adapter._consecutiveFailures).toBe(0);
    });

    // ── getStatus completeness ────────────────────────────────────────────────

    it('getStatus reflects all fields after mixed operations', () => {
        adapter.recordFailure(makeError('first'));
        adapter.recordSuccess();
        adapter.recordFailure(makeError('second'));

        const status = adapter.getStatus();
        expect(status.consecutiveFailures).toBe(1);
        expect(status.circuitBreakerOpen).toBe(false);
        expect(status.available).toBe(true);
        expect(status.lastSuccessAt).not.toBeNull();
        expect(status.lastFailureAt).not.toBeNull();
        expect(status.lastErrorMessage).toBe('second');
    });
});
