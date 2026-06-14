/**
 * Retry + timeout policy for engine calls (PRD §F4 "Error handling").
 *
 *   - Retry up to 3 times with exponential backoff: 1s, 3s, 9s.
 *   - On HTTP 429: wait the `Retry-After` header value instead of the backoff.
 *   - Hard 30s timeout per call (AbortController + a timeout race).
 *   - Auth/4xx errors are NOT retried (retrying won't help).
 *
 * `sleep` is injectable so unit tests run instantly without real timers.
 */

/** Thrown when a single call exceeds the timeout budget. */
export class EngineTimeoutError extends Error {
    constructor(public readonly timeoutMs: number) {
        super(`Engine call timed out after ${timeoutMs}ms`);
        this.name = 'EngineTimeoutError';
    }
}

export interface WithRetryOptions {
    /** Max retries AFTER the initial attempt. Default 3 (→ up to 4 attempts). */
    retries?: number;
    /** Backoff before each retry, in ms. Default [1000, 3000, 9000]. */
    backoffMs?: number[];
    /** Per-attempt timeout in ms. Default 30000. */
    timeoutMs?: number;
    /** Injected sleep (tests pass an immediate/fake sleep). */
    sleep?: (ms: number) => Promise<void>;
    /** Decide whether an error is worth retrying. */
    isRetryable?: (err: unknown) => boolean;
    /** Extract a 429 Retry-After delay (ms) from an error, or null. */
    getRetryAfterMs?: (err: unknown) => number | null;
}

const defaultSleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

/** HTTP status helper. */
function statusOf(err: unknown): number | undefined {
    return (err as { status?: number } | null)?.status;
}

/**
 * Default retry policy: timeouts, 429s, 5xx, and network errors retry; explicit
 * 4xx (auth, bad request) do not.
 */
export function defaultIsRetryable(err: unknown): boolean {
    if (err instanceof EngineTimeoutError) {
        return true;
    }
    const status = statusOf(err);
    if (typeof status === 'number') {
        if (status === 429) return true;
        return status >= 500; // 5xx retry; other 4xx do not
    }
    return true; // network / unknown → retry
}

/** Default 429 Retry-After extraction (seconds → ms), from field or header. */
export function defaultGetRetryAfterMs(err: unknown): number | null {
    if (statusOf(err) !== 429) {
        return null;
    }
    const e = err as {
        retryAfterMs?: number;
        headers?: Headers | Record<string, string | undefined>;
    };
    if (typeof e.retryAfterMs === 'number') {
        return e.retryAfterMs;
    }
    let raw: string | undefined | null;
    const h = e.headers;
    if (h && typeof (h as Headers).get === 'function') {
        raw = (h as Headers).get('retry-after');
    } else if (h && typeof h === 'object') {
        raw = (h as Record<string, string | undefined>)['retry-after'];
    }
    if (raw == null) {
        return null;
    }
    const seconds = Number(raw);
    return Number.isFinite(seconds) ? seconds * 1000 : null;
}

/** Run `op` once, rejecting with {@link EngineTimeoutError} after `timeoutMs`. */
function runWithTimeout<T>(
    op: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const controller = new AbortController();
        let settled = false;

        const timer = setTimeout(() => {
            settled = true;
            controller.abort();
            reject(new EngineTimeoutError(timeoutMs));
        }, timeoutMs);

        op(controller.signal).then(
            (value) => {
                if (!settled) {
                    clearTimeout(timer);
                    resolve(value);
                }
            },
            (err) => {
                if (!settled) {
                    clearTimeout(timer);
                    reject(err);
                }
            },
        );
    });
}

/**
 * Execute `op` with timeout + retry/backoff per PRD §F4. Resolves with `op`'s
 * value, or rejects with the last error after exhausting retries.
 */
export async function withRetry<T>(
    op: (signal: AbortSignal) => Promise<T>,
    opts: WithRetryOptions = {},
): Promise<T> {
    const retries = opts.retries ?? 3;
    const backoffMs = opts.backoffMs ?? [1000, 3000, 9000];
    const timeoutMs = opts.timeoutMs ?? 30000;
    const sleep = opts.sleep ?? defaultSleep;
    const isRetryable = opts.isRetryable ?? defaultIsRetryable;
    const getRetryAfterMs = opts.getRetryAfterMs ?? defaultGetRetryAfterMs;

    let attempt = 0;
    for (;;) {
        try {
            return await runWithTimeout(op, timeoutMs);
        } catch (err) {
            if (attempt >= retries || !isRetryable(err)) {
                throw err;
            }
            const retryAfter = getRetryAfterMs(err);
            const wait = retryAfter ?? backoffMs[Math.min(attempt, backoffMs.length - 1)];
            await sleep(wait);
            attempt += 1;
        }
    }
}
