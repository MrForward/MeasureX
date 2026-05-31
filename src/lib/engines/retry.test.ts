import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineAdapter, EngineExecutionResult, ExecutionContext, PromptInput, StandardizedResponse } from './types';
import { EngineAuthError, EngineError, EngineParseError, EngineRateLimitError } from './types';
import { delay, executeWithRetry } from './retry';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PROMPT: PromptInput = {
    text: 'Who is the best CRM?',
    language: 'en',
    geography: 'US',
    promptId: 'prompt-1',
    workspaceId: 'ws-1',
};

const CONTEXT: ExecutionContext = {
    runId: 'run-1',
    promptId: 'prompt-1',
    workspaceId: 'ws-1',
    executionId: 'exec-1',
    attemptNumber: 1,
};

const MOCK_RESPONSE: StandardizedResponse = {
    rawText: 'HubSpot is a great CRM.',
    citations: [],
    metadata: {},
    modelVersion: 'gpt-4o-mini',
    timestamp: new Date('2024-01-01T00:00:00Z'),
    executionTimeMs: 500,
};

const SUCCESS_RESULT: EngineExecutionResult = { success: true, response: MOCK_RESPONSE };

function makeCircuitBlockedResult(): EngineExecutionResult {
    return {
        success: false,
        error: new EngineError('Circuit breaker open', 'chatgpt', 'api_error', false),
    };
}

function makeRetryableError(): EngineRateLimitError {
    return new EngineRateLimitError('chatgpt', 'Rate limit exceeded', 429);
}

function makeNonRetryableError(): EngineAuthError {
    return new EngineAuthError('chatgpt', 'Invalid API key', 401);
}

/**
 * Returns an execute function that throws on the specified call numbers and
 * returns successResult on all others. Uses throw (not Promise.reject) to
 * avoid unhandled-rejection warnings from pre-rejected mock promises.
 */
function makeExecute(
    throwOnCalls: number[],
    errorFactory: () => EngineError,
    successResult: EngineExecutionResult = SUCCESS_RESULT,
): EngineAdapter['execute'] {
    let callCount = 0;
    return async () => {
        callCount++;
        if (throwOnCalls.includes(callCount)) {
            throw errorFactory();
        }
        return successResult;
    };
}

/** Build a minimal mock adapter with a controllable execute function. */
function makeAdapter(executeFn: EngineAdapter['execute']): EngineAdapter {
    return {
        engineId: 'chatgpt',
        engineName: 'ChatGPT',
        execute: executeFn,
        parseResponse: vi.fn(),
        getStatus: vi.fn().mockReturnValue({
            available: true,
            consecutiveFailures: 0,
            circuitBreakerOpen: false,
            lastSuccessAt: null,
            lastFailureAt: null,
            lastErrorMessage: null,
        }),
        getRateLimits: vi.fn().mockReturnValue({ requestsPerMinute: 60, requestsPerDay: 10000, cooldownMs: 1000 }),
        getCostPerCall: vi.fn().mockReturnValue(0.0015),
    };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

/**
 * Validates: Requirement 4.7 (retry up to 3 times with exponential backoff)
 */
describe('executeWithRetry', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns success on first attempt without retrying', async () => {
        const execute = vi.fn().mockResolvedValue(SUCCESS_RESULT);
        const adapter = makeAdapter(execute);

        const result = await executeWithRetry(adapter, PROMPT, CONTEXT, { maxAttempts: 3, baseDelayMs: 1000, jitterMs: 0 });

        expect(result).toEqual(SUCCESS_RESULT);
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('returns circuit-blocked result immediately without retrying', async () => {
        const blocked = makeCircuitBlockedResult();
        const execute = vi.fn().mockResolvedValue(blocked);
        const adapter = makeAdapter(execute);

        const result = await executeWithRetry(adapter, PROMPT, CONTEXT, { maxAttempts: 3, baseDelayMs: 1000, jitterMs: 0 });

        expect(result).toEqual(blocked);
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('retries on retryable error and succeeds on 2nd attempt', async () => {
        // Throw on call 1, succeed on call 2
        const execute = makeExecute([1], makeRetryableError);
        const adapter = makeAdapter(execute);

        const promise = executeWithRetry(adapter, PROMPT, CONTEXT, { maxAttempts: 3, baseDelayMs: 1000, jitterMs: 0 });
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result).toEqual(SUCCESS_RESULT);
    });

    it('retries on retryable error and succeeds on 3rd attempt', async () => {
        // Throw on calls 1 and 2, succeed on call 3
        const execute = makeExecute([1, 2], makeRetryableError);
        const adapter = makeAdapter(execute);

        const promise = executeWithRetry(adapter, PROMPT, CONTEXT, { maxAttempts: 3, baseDelayMs: 1000, jitterMs: 0 });
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result).toEqual(SUCCESS_RESULT);
    });

    it('throws immediately on non-retryable error without retrying', async () => {
        let callCount = 0;
        const execute: EngineAdapter['execute'] = async () => {
            callCount++;
            throw makeNonRetryableError();
        };
        const adapter = makeAdapter(execute);

        await expect(
            executeWithRetry(adapter, PROMPT, CONTEXT, { maxAttempts: 3, baseDelayMs: 1000, jitterMs: 0 }),
        ).rejects.toBeInstanceOf(EngineAuthError);

        expect(callCount).toBe(1);
    });

    it('throws immediately on EngineParseError (non-retryable)', async () => {
        let callCount = 0;
        const execute: EngineAdapter['execute'] = async () => {
            callCount++;
            throw new EngineParseError('chatgpt', 'Cannot parse response');
        };
        const adapter = makeAdapter(execute);

        await expect(
            executeWithRetry(adapter, PROMPT, CONTEXT, { maxAttempts: 3, baseDelayMs: 1000, jitterMs: 0 }),
        ).rejects.toBeInstanceOf(EngineParseError);

        expect(callCount).toBe(1);
    });

    it('throws after all attempts exhausted', async () => {
        // Throw on all 3 calls
        const execute = makeExecute([1, 2, 3], makeRetryableError);
        const adapter = makeAdapter(execute);

        const promise = executeWithRetry(adapter, PROMPT, CONTEXT, { maxAttempts: 3, baseDelayMs: 1000, jitterMs: 0 });
        // Attach rejection handler BEFORE advancing timers to avoid unhandled rejection
        const rejection = expect(promise).rejects.toBeInstanceOf(EngineRateLimitError);
        await vi.runAllTimersAsync();
        await rejection;
    });

    it('delays increase exponentially between attempts', async () => {
        // Throw on all 3 calls
        const execute = makeExecute([1, 2, 3], makeRetryableError);
        const adapter = makeAdapter(execute);

        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

        const promise = executeWithRetry(adapter, PROMPT, CONTEXT, { maxAttempts: 3, baseDelayMs: 1000, jitterMs: 0 });
        // Attach rejection handler before advancing timers
        const rejection = promise.catch(() => { /* expected */ });
        await vi.runAllTimersAsync();
        await rejection;

        // Attempt 1 fails → wait 1000ms (baseDelay * 2^0)
        // Attempt 2 fails → wait 2000ms (baseDelay * 2^1)
        // Attempt 3 fails → throw (no more delay)
        const delayCalls = setTimeoutSpy.mock.calls
            .map(([, ms]) => ms as number)
            .filter((ms) => ms === 1000 || ms === 2000);

        expect(delayCalls).toContain(1000);
        expect(delayCalls).toContain(2000);
    });

    it('passes correct attemptNumber to each execute call', async () => {
        const capturedAttempts: number[] = [];
        const execute: EngineAdapter['execute'] = async (_prompt, context) => {
            capturedAttempts.push(context!.attemptNumber);
            if (capturedAttempts.length < 3) throw makeRetryableError();
            return SUCCESS_RESULT;
        };
        const adapter = makeAdapter(execute);

        const promise = executeWithRetry(adapter, PROMPT, CONTEXT, { maxAttempts: 3, baseDelayMs: 100, jitterMs: 0 });
        await vi.runAllTimersAsync();
        await promise;

        expect(capturedAttempts).toEqual([1, 2, 3]);
    });

    it('respects maxAttempts option override', async () => {
        let callCount = 0;
        const execute: EngineAdapter['execute'] = async () => {
            callCount++;
            throw makeRetryableError();
        };
        const adapter = makeAdapter(execute);

        const promise = executeWithRetry(adapter, PROMPT, CONTEXT, { maxAttempts: 1, baseDelayMs: 1000, jitterMs: 0 });
        // Attach rejection handler before advancing timers
        const rejection = expect(promise).rejects.toBeInstanceOf(EngineError);
        await vi.runAllTimersAsync();
        await rejection;

        // Only 1 attempt — no retries
        expect(callCount).toBe(1);
    });

    it('respects baseDelayMs option override', async () => {
        // Throw on calls 1 and 2
        const execute = makeExecute([1, 2], makeRetryableError);
        const adapter = makeAdapter(execute);

        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

        const promise = executeWithRetry(adapter, PROMPT, CONTEXT, { maxAttempts: 2, baseDelayMs: 500, jitterMs: 0 });
        // Attach rejection handler before advancing timers
        const rejection = promise.catch(() => { /* expected */ });
        await vi.runAllTimersAsync();
        await rejection;

        // Attempt 1 fails → delay(500 * 2^0 + 0) = delay(500)
        const delayCalls = setTimeoutSpy.mock.calls
            .map(([, ms]) => ms as number)
            .filter((ms) => ms === 500);

        expect(delayCalls).toHaveLength(1);
    });

    it('caps delay at maxDelayMs', async () => {
        // Throw on calls 1 and 2
        const execute = makeExecute([1, 2], makeRetryableError);
        const adapter = makeAdapter(execute);

        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

        // baseDelay=10000, attempt 1 → 10000*2^0 = 10000, but maxDelayMs=5000
        const promise = executeWithRetry(adapter, PROMPT, CONTEXT, {
            maxAttempts: 2,
            baseDelayMs: 10_000,
            maxDelayMs: 5_000,
            jitterMs: 0,
        });
        // Attach rejection handler before advancing timers
        const rejection = promise.catch(() => { /* expected */ });
        await vi.runAllTimersAsync();
        await rejection;

        // The delay should be capped at 5000, not 10000
        const delayCalls = setTimeoutSpy.mock.calls.map(([, ms]) => ms as number);
        expect(delayCalls).toContain(5_000);
        expect(delayCalls).not.toContain(10_000);
    });
});

// ── delay helper ──────────────────────────────────────────────────────────────

describe('delay', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('resolves after the specified number of milliseconds', async () => {
        let resolved = false;
        const p = delay(1000).then(() => { resolved = true; });

        expect(resolved).toBe(false);
        vi.advanceTimersByTime(999);
        await Promise.resolve(); // flush microtasks
        expect(resolved).toBe(false);

        vi.advanceTimersByTime(1);
        await p;
        expect(resolved).toBe(true);
    });
});
