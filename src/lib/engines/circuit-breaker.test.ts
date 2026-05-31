/**
 * Standalone circuit breaker behavior tests.
 *
 * This file documents and verifies the circuit breaker pattern implemented in
 * BaseEngineAdapter in isolation. It serves as a living specification for the
 * circuit breaker contract defined in Requirement 18.6.
 *
 * Validates: Requirement 18.6 — after 5 consecutive failures within 1 hour,
 * pause requests to that engine for 30 minutes before retrying.
 *
 * Thresholds are sourced from CONFIG_DEFAULTS:
 *   - engines.circuit_breaker_failures  → 5  (consecutive failures to open)
 *   - engines.circuit_breaker_pause_ms  → 1_800_000 (30 minutes in ms)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BaseEngineAdapter } from './base-adapter';
import { CONFIG_DEFAULTS } from '@/lib/config/defaults';
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

// ── Minimal concrete adapter for isolation testing ────────────────────────────

class IsolatedAdapter extends BaseEngineAdapter {
    readonly engineId: EngineId = 'perplexity';
    readonly engineName = 'Isolated Test Adapter';

    async execute(_prompt: PromptInput, _ctx?: ExecutionContext): Promise<EngineExecutionResult> {
        return { success: true, response: this._stub() };
    }

    parseResponse(_raw: unknown): StandardizedResponse {
        return this._stub();
    }

    getRateLimits(): RateLimitConfig {
        return { requestsPerMinute: 50, requestsPerDay: 5000, cooldownMs: 1200 };
    }

    getCostPerCall(): number {
        return 0.001;
    }

    private _stub(): StandardizedResponse {
        return {
            rawText: '',
            citations: [],
            metadata: {},
            modelVersion: 'stub',
            timestamp: new Date(),
            executionTimeMs: 0,
        };
    }

    // Expose protected fields for white-box assertions
    get failures() { return this.consecutiveFailures; }
    get isOpen() { return this.circuitBreakerOpen; }
    get openedAt() { return this.circuitOpenedAt; }
    get lastSuccess() { return this.lastSuccessAt; }
    get lastFailure() { return this.lastFailureAt; }
    get lastError() { return this.lastErrorMessage; }
}

function err(msg = 'engine error'): EngineError {
    return new EngineError(msg, 'perplexity', 'api_error', true);
}

function openCircuit(adapter: IsolatedAdapter, count = 5): void {
    for (let i = 0; i < count; i++) {
        adapter.recordFailure(err());
    }
}

// ── Helpers: read thresholds from CONFIG_DEFAULTS (not hardcoded) ─────────────

const FAILURE_THRESHOLD = CONFIG_DEFAULTS['engines.circuit_breaker_failures'].value as number;
const PAUSE_MS = CONFIG_DEFAULTS['engines.circuit_breaker_pause_ms'].value as number;

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Circuit Breaker — isolation tests (Requirement 18.6)', () => {
    let adapter: IsolatedAdapter;

    beforeEach(() => {
        adapter = new IsolatedAdapter();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ── 1. CONFIG_DEFAULTS thresholds ─────────────────────────────────────────

    describe('1. Thresholds come from CONFIG_DEFAULTS (not hardcoded)', () => {
        it('failure threshold is 5 per CONFIG_DEFAULTS', () => {
            expect(FAILURE_THRESHOLD).toBe(5);
        });

        it('pause duration is 1_800_000 ms (30 min) per CONFIG_DEFAULTS', () => {
            expect(PAUSE_MS).toBe(1_800_000);
        });

        it('circuit opens exactly at the configured threshold, not before', () => {
            for (let i = 1; i < FAILURE_THRESHOLD; i++) {
                adapter.recordFailure(err());
                expect(adapter.isCircuitOpen()).toBe(false);
            }
            adapter.recordFailure(err()); // Nth failure
            expect(adapter.isCircuitOpen()).toBe(true);
        });
    });

    // ── 2. Initial state ──────────────────────────────────────────────────────

    describe('2. Initial state — circuit is closed', () => {
        it('isCircuitOpen() returns false on a fresh adapter', () => {
            expect(adapter.isCircuitOpen()).toBe(false);
        });

        it('consecutiveFailures starts at 0', () => {
            expect(adapter.failures).toBe(0);
        });

        it('circuitBreakerOpen starts as false', () => {
            expect(adapter.isOpen).toBe(false);
        });

        it('getStatus() reports available=true and all nulls initially', () => {
            const status: EngineStatus = adapter.getStatus();
            expect(status.available).toBe(true);
            expect(status.consecutiveFailures).toBe(0);
            expect(status.circuitBreakerOpen).toBe(false);
            expect(status.lastSuccessAt).toBeNull();
            expect(status.lastFailureAt).toBeNull();
            expect(status.lastErrorMessage).toBeNull();
        });
    });

    // ── 3. Failure counter increments ─────────────────────────────────────────

    describe('3. Failure counter increments correctly', () => {
        it('each recordFailure increments consecutiveFailures by 1', () => {
            for (let i = 1; i <= 4; i++) {
                adapter.recordFailure(err());
                expect(adapter.failures).toBe(i);
            }
        });

        it('records lastFailureAt timestamp on each failure', () => {
            const before = Date.now();
            adapter.recordFailure(err());
            expect(adapter.lastFailure).not.toBeNull();
            expect(adapter.lastFailure!.getTime()).toBeGreaterThanOrEqual(before);
        });

        it('records lastErrorMessage from the EngineError', () => {
            adapter.recordFailure(err('connection refused'));
            expect(adapter.lastError).toBe('connection refused');
            adapter.recordFailure(err('timeout'));
            expect(adapter.lastError).toBe('timeout');
        });

        it('getStatus().consecutiveFailures matches internal counter', () => {
            adapter.recordFailure(err());
            adapter.recordFailure(err());
            adapter.recordFailure(err());
            expect(adapter.getStatus().consecutiveFailures).toBe(3);
        });
    });

    // ── 4. Circuit opens after N consecutive failures ─────────────────────────

    describe('4. Circuit opens after N consecutive failures', () => {
        it('isCircuitOpen() returns true after exactly 5 failures', () => {
            openCircuit(adapter);
            expect(adapter.isCircuitOpen()).toBe(true);
        });

        it('circuitBreakerOpen flag is set to true', () => {
            openCircuit(adapter);
            expect(adapter.isOpen).toBe(true);
        });

        it('circuitOpenedAt is recorded when circuit opens', () => {
            expect(adapter.openedAt).toBeNull();
            openCircuit(adapter);
            expect(adapter.openedAt).not.toBeNull();
            expect(adapter.openedAt!.getTime()).toBeLessThanOrEqual(Date.now());
        });

        it('getStatus().available is false when circuit is open', () => {
            openCircuit(adapter);
            expect(adapter.getStatus().available).toBe(false);
        });

        it('getStatus().circuitBreakerOpen is true when circuit is open', () => {
            openCircuit(adapter);
            expect(adapter.getStatus().circuitBreakerOpen).toBe(true);
        });

        it('additional failures beyond threshold do not re-set circuitOpenedAt', () => {
            openCircuit(adapter); // opens at failure #5
            const openedAt = adapter.openedAt!.getTime();

            vi.advanceTimersByTime(1000); // advance 1 second
            adapter.recordFailure(err()); // 6th failure
            adapter.recordFailure(err()); // 7th failure

            // circuitOpenedAt should still be the original timestamp
            expect(adapter.openedAt!.getTime()).toBe(openedAt);
        });

        it('consecutiveFailures continues to increment beyond threshold', () => {
            openCircuit(adapter, 7);
            expect(adapter.failures).toBe(7);
        });
    });

    // ── 5. Circuit stays open during pause duration ───────────────────────────

    describe('5. Circuit stays open for the full pause duration', () => {
        it('isCircuitOpen() returns true 1ms before pause elapses', () => {
            openCircuit(adapter);
            vi.advanceTimersByTime(PAUSE_MS - 1);
            expect(adapter.isCircuitOpen()).toBe(true);
        });

        it('isCircuitOpen() returns true at exactly 1 second into pause', () => {
            openCircuit(adapter);
            vi.advanceTimersByTime(1000);
            expect(adapter.isCircuitOpen()).toBe(true);
        });

        it('isCircuitOpen() returns true at halfway through pause', () => {
            openCircuit(adapter);
            vi.advanceTimersByTime(PAUSE_MS / 2);
            expect(adapter.isCircuitOpen()).toBe(true);
        });
    });

    // ── 6. Auto-reset after pause duration elapses ───────────────────────────

    describe('6. Auto-reset after pause duration elapses', () => {
        it('isCircuitOpen() returns false once pause duration has elapsed', () => {
            openCircuit(adapter);
            vi.advanceTimersByTime(PAUSE_MS + 1);
            expect(adapter.isCircuitOpen()).toBe(false);
        });

        it('auto-reset clears circuitBreakerOpen flag', () => {
            openCircuit(adapter);
            vi.advanceTimersByTime(PAUSE_MS + 1);
            adapter.isCircuitOpen(); // trigger side-effect
            expect(adapter.isOpen).toBe(false);
        });

        it('auto-reset resets consecutiveFailures to 0', () => {
            openCircuit(adapter);
            vi.advanceTimersByTime(PAUSE_MS + 1);
            adapter.isCircuitOpen(); // trigger side-effect
            expect(adapter.failures).toBe(0);
        });

        it('auto-reset clears circuitOpenedAt', () => {
            openCircuit(adapter);
            vi.advanceTimersByTime(PAUSE_MS + 1);
            adapter.isCircuitOpen(); // trigger side-effect
            expect(adapter.openedAt).toBeNull();
        });

        it('getStatus().available is true after auto-reset', () => {
            openCircuit(adapter);
            vi.advanceTimersByTime(PAUSE_MS + 1);
            expect(adapter.getStatus().available).toBe(true);
        });

        it('circuit can be re-opened after auto-reset', () => {
            openCircuit(adapter);
            vi.advanceTimersByTime(PAUSE_MS + 1);
            expect(adapter.isCircuitOpen()).toBe(false); // auto-reset

            // Now fail again — circuit should re-open
            openCircuit(adapter);
            expect(adapter.isCircuitOpen()).toBe(true);
        });
    });

    // ── 7. Immediate reset on success ─────────────────────────────────────────

    describe('7. Resets immediately on any success', () => {
        it('recordSuccess resets consecutiveFailures to 0', () => {
            adapter.recordFailure(err());
            adapter.recordFailure(err());
            adapter.recordSuccess();
            expect(adapter.failures).toBe(0);
        });

        it('recordSuccess closes an open circuit', () => {
            openCircuit(adapter);
            expect(adapter.isCircuitOpen()).toBe(true);
            adapter.recordSuccess();
            expect(adapter.isCircuitOpen()).toBe(false);
        });

        it('recordSuccess sets circuitBreakerOpen to false', () => {
            openCircuit(adapter);
            adapter.recordSuccess();
            expect(adapter.isOpen).toBe(false);
        });

        it('recordSuccess clears circuitOpenedAt', () => {
            openCircuit(adapter);
            adapter.recordSuccess();
            expect(adapter.openedAt).toBeNull();
        });

        it('recordSuccess sets lastSuccessAt', () => {
            const before = Date.now();
            adapter.recordSuccess();
            expect(adapter.lastSuccess).not.toBeNull();
            expect(adapter.lastSuccess!.getTime()).toBeGreaterThanOrEqual(before);
        });

        it('getStatus().available is true after success resets circuit', () => {
            openCircuit(adapter);
            adapter.recordSuccess();
            expect(adapter.getStatus().available).toBe(true);
        });

        it('a single success after 4 failures prevents circuit from opening', () => {
            for (let i = 0; i < 4; i++) adapter.recordFailure(err());
            adapter.recordSuccess();
            // Now fail 4 more times — should still not open (counter was reset)
            for (let i = 0; i < 4; i++) adapter.recordFailure(err());
            expect(adapter.isCircuitOpen()).toBe(false);
        });
    });

    // ── 8. getStatus() completeness ───────────────────────────────────────────

    describe('8. getStatus() returns correct state at each stage', () => {
        it('reflects closed state correctly', () => {
            const s = adapter.getStatus();
            expect(s).toMatchObject({
                available: true,
                consecutiveFailures: 0,
                circuitBreakerOpen: false,
                lastSuccessAt: null,
                lastFailureAt: null,
                lastErrorMessage: null,
            });
        });

        it('reflects partially-failed state (below threshold)', () => {
            adapter.recordFailure(err('partial'));
            adapter.recordFailure(err('partial'));
            const s = adapter.getStatus();
            expect(s.available).toBe(true);
            expect(s.consecutiveFailures).toBe(2);
            expect(s.circuitBreakerOpen).toBe(false);
            expect(s.lastErrorMessage).toBe('partial');
        });

        it('reflects open state correctly', () => {
            openCircuit(adapter);
            const s = adapter.getStatus();
            expect(s.available).toBe(false);
            expect(s.consecutiveFailures).toBe(5);
            expect(s.circuitBreakerOpen).toBe(true);
        });

        it('reflects auto-reset state after pause elapses', () => {
            openCircuit(adapter);
            vi.advanceTimersByTime(PAUSE_MS + 1);
            const s = adapter.getStatus();
            expect(s.available).toBe(true);
            expect(s.consecutiveFailures).toBe(0);
            expect(s.circuitBreakerOpen).toBe(false);
        });

        it('reflects mixed success/failure history', () => {
            adapter.recordFailure(err('first'));
            adapter.recordSuccess();
            adapter.recordFailure(err('second'));
            const s = adapter.getStatus();
            expect(s.consecutiveFailures).toBe(1);
            expect(s.available).toBe(true);
            expect(s.lastSuccessAt).not.toBeNull();
            expect(s.lastFailureAt).not.toBeNull();
            expect(s.lastErrorMessage).toBe('second');
        });
    });

    // ── 9. Per-instance isolation ─────────────────────────────────────────────

    describe('9. Circuit breaker state is per-adapter-instance (not global)', () => {
        it('two adapters have independent circuit breaker state', () => {
            const adapterA = new IsolatedAdapter();
            const adapterB = new IsolatedAdapter();

            openCircuit(adapterA);

            expect(adapterA.isCircuitOpen()).toBe(true);
            expect(adapterB.isCircuitOpen()).toBe(false);
        });

        it('resetting one adapter does not affect another', () => {
            const adapterA = new IsolatedAdapter();
            const adapterB = new IsolatedAdapter();

            openCircuit(adapterA);
            openCircuit(adapterB);

            adapterA.recordSuccess();

            expect(adapterA.isCircuitOpen()).toBe(false);
            expect(adapterB.isCircuitOpen()).toBe(true);
        });
    });
});
