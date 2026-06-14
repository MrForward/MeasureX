/**
 * Unit tests for the retry/timeout policy (PRD §F4 error handling).
 * `sleep` is mocked so waits are recorded without real delays.
 */

import { describe, it, expect } from 'vitest';
import { withRetry, EngineTimeoutError } from './backoff';

interface HttpError extends Error {
    status?: number;
    retryAfterMs?: number;
    headers?: Record<string, string>;
}

function httpError(message: string, status: number, extra: Partial<HttpError> = {}): HttpError {
    const e = new Error(message) as HttpError;
    e.status = status;
    Object.assign(e, extra);
    return e;
}

describe('withRetry', () => {
    it('returns immediately on first success (no sleeps)', async () => {
        const sleeps: number[] = [];
        let calls = 0;
        const result = await withRetry(
            async () => {
                calls += 1;
                return 'ok';
            },
            { sleep: async (ms) => void sleeps.push(ms) },
        );
        expect(result).toBe('ok');
        expect(calls).toBe(1);
        expect(sleeps).toEqual([]);
    });

    it('retries a 5xx and succeeds on the 3rd attempt with 1s/3s backoff', async () => {
        const sleeps: number[] = [];
        let calls = 0;
        const result = await withRetry(
            async () => {
                calls += 1;
                if (calls < 3) throw httpError('boom', 503);
                return 'ok';
            },
            { sleep: async (ms) => void sleeps.push(ms) },
        );
        expect(result).toBe('ok');
        expect(calls).toBe(3);
        expect(sleeps).toEqual([1000, 3000]);
    });

    it('exhausts 3 retries (4 attempts) then throws, backoff 1s/3s/9s', async () => {
        const sleeps: number[] = [];
        let calls = 0;
        await expect(
            withRetry(
                async () => {
                    calls += 1;
                    throw httpError('still failing', 500);
                },
                { sleep: async (ms) => void sleeps.push(ms) },
            ),
        ).rejects.toThrow('still failing');
        expect(calls).toBe(4);
        expect(sleeps).toEqual([1000, 3000, 9000]);
    });

    it('does not retry an auth (401) error', async () => {
        const sleeps: number[] = [];
        let calls = 0;
        await expect(
            withRetry(
                async () => {
                    calls += 1;
                    throw httpError('unauthorized', 401);
                },
                { sleep: async (ms) => void sleeps.push(ms) },
            ),
        ).rejects.toThrow('unauthorized');
        expect(calls).toBe(1);
        expect(sleeps).toEqual([]);
    });

    it('honors the Retry-After value on 429 (from field)', async () => {
        const sleeps: number[] = [];
        let calls = 0;
        await withRetry(
            async () => {
                calls += 1;
                if (calls < 2) throw httpError('rate limited', 429, { retryAfterMs: 2500 });
                return 'ok';
            },
            { sleep: async (ms) => void sleeps.push(ms) },
        );
        expect(sleeps).toEqual([2500]);
    });

    it('honors the Retry-After header on 429 (seconds → ms)', async () => {
        const sleeps: number[] = [];
        let calls = 0;
        await withRetry(
            async () => {
                calls += 1;
                if (calls < 2) throw httpError('rate limited', 429, { headers: { 'retry-after': '4' } });
                return 'ok';
            },
            { sleep: async (ms) => void sleeps.push(ms) },
        );
        expect(sleeps).toEqual([4000]);
    });

    it('times out a hung call with EngineTimeoutError', async () => {
        await expect(
            withRetry(() => new Promise<string>(() => {}), {
                retries: 0,
                timeoutMs: 20,
            }),
        ).rejects.toBeInstanceOf(EngineTimeoutError);
    });
});
