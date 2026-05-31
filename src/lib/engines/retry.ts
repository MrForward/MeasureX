import { CONFIG_DEFAULTS } from '@/lib/config/defaults';
import type { EngineAdapter, EngineExecutionResult, ExecutionContext, PromptInput } from './types';
import { EngineError } from './types';

/**
 * Options for controlling retry behaviour.
 * All fields are optional — defaults are read from CONFIG_DEFAULTS.
 */
export interface RetryOptions {
    /** Maximum number of attempts (first try + retries). Default: 3 */
    maxAttempts?: number;
    /** Base delay in ms for exponential backoff. Default: 1000 */
    baseDelayMs?: number;
    /** Hard cap on delay between retries. Default: 30000 */
    maxDelayMs?: number;
    /** Random jitter added to each delay to prevent thundering herd. Default: 200 */
    jitterMs?: number;
}

/**
 * Resolves a numeric option, falling back to a CONFIG_DEFAULTS key.
 */
function resolveOption(value: number | undefined, configKey: string): number {
    if (value !== undefined) return value;
    return CONFIG_DEFAULTS[configKey].value as number;
}

/**
 * Returns a Promise that resolves after `ms` milliseconds.
 * Exported so tests can spy on / fake it.
 */
export function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps an engine adapter's `execute` call with exponential-backoff retry logic.
 *
 * Retry rules (token burn protection):
 *  - Circuit-blocked results (`success: false`) → return immediately, no retry.
 *  - `EngineError` with `retryable: false` (auth, parse) → throw immediately.
 *  - `EngineError` with `retryable: true` → wait and retry up to `maxAttempts`.
 *  - After all attempts exhausted → throw the last `EngineError`.
 *
 * Delay formula: `min(baseDelayMs * 2^(attempt-1) + jitter, maxDelayMs)`
 *   - Attempt 1 fails → wait baseDelay + jitter before attempt 2
 *   - Attempt 2 fails → wait baseDelay*2 + jitter before attempt 3
 *   - Attempt 3 fails → throw (no more retries)
 *
 * Validates: Requirement 4.7 (retry up to 3 times with exponential backoff)
 */
export async function executeWithRetry(
    adapter: EngineAdapter,
    prompt: PromptInput,
    context: ExecutionContext,
    options?: RetryOptions,
): Promise<EngineExecutionResult> {
    const maxAttempts = resolveOption(options?.maxAttempts, 'engines.retry_max_attempts');
    const baseDelayMs = resolveOption(options?.baseDelayMs, 'engines.retry_base_delay_ms');
    const maxDelayMs = options?.maxDelayMs ?? 30_000;
    const jitterMs = options?.jitterMs ?? 200;

    let lastError: EngineError | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let result: EngineExecutionResult;

        try {
            result = await adapter.execute(prompt, { ...context, attemptNumber: attempt });
        } catch (err) {
            // Only EngineError instances are handled here; anything else propagates.
            if (!(err instanceof EngineError)) throw err;

            // Non-retryable errors (auth, parse) → fail immediately.
            if (!err.retryable) throw err;

            lastError = err;

            // If we've exhausted all attempts, throw now.
            if (attempt >= maxAttempts) break;

            // Compute exponential backoff delay with jitter.
            const jitter = Math.random() * jitterMs;
            const backoff = Math.min(baseDelayMs * Math.pow(2, attempt - 1) + jitter, maxDelayMs);
            await delay(backoff);
            continue;
        }

        // Circuit-blocked result → return immediately, no retry.
        if (!result.success) return result;

        // Successful result.
        return result;
    }

    // All attempts exhausted — throw the last recorded error.
    throw lastError!;
}
