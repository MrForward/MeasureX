/**
 * Wraps a low-level {@link CompletionCaller} into a never-throwing
 * {@link EngineRunResult} (PRD §F4 "Store per run").
 *
 * Applies the retry/timeout policy, then maps success/failure into the row
 * shape. A failed call (after retries) yields `status: 'failed'` with an error
 * message — the scan continues with the next prompt (PRD §F4).
 */

import { withRetry, EngineTimeoutError, type WithRetryOptions } from './backoff';
import type { CompletionCaller, EngineId, EngineRunResult } from './types';

export interface ExecuteEngineRunOptions {
    /** Override retry/timeout policy (tests inject an immediate sleep). */
    retry?: WithRetryOptions;
}

/**
 * Map a provider error to a SAFE, generic message (PRD §F4 error handling).
 *
 * The raw error from OpenAI/Perplexity can contain internal details — API key
 * fragments, org ids, account info — and this string is persisted on the
 * `EngineRun` row and shown in the raw-answer viewer. We classify by HTTP status
 * / timeout only and never surface the provider's raw message.
 */
function safeErrorMessage(err: unknown): string {
    if (err instanceof EngineTimeoutError) {
        return 'The engine timed out.';
    }
    const status = (err as { status?: number } | null)?.status;
    if (typeof status === 'number') {
        if (status === 429) return 'The engine is rate limited. Please try again later.';
        if (status === 401 || status === 403) return 'Engine authentication failed.';
        if (status >= 500) return 'The engine returned a server error.';
        return 'The engine rejected the request.';
    }
    return 'The engine call failed.';
}

/**
 * Execute one prompt-engine call and normalize the outcome.
 *
 * @param engine  engine id (for the result + logging).
 * @param model   model name to record (e.g. "gpt-4o-mini", "sonar").
 * @param caller  performs the actual API call given an abort signal.
 */
export async function executeEngineRun(
    engine: EngineId,
    model: string,
    caller: CompletionCaller,
    opts: ExecuteEngineRunOptions = {},
): Promise<EngineRunResult> {
    try {
        const completion = await withRetry(caller, opts.retry);
        return {
            engine,
            model: completion.model ?? model,
            status: 'completed',
            rawResponse: completion.content ?? '',
            nativeCitations: completion.citations ?? [],
            tokensUsed: completion.tokensUsed ?? null,
            errorMessage: null,
        };
    } catch (err) {
        return {
            engine,
            model,
            status: 'failed',
            rawResponse: null,
            nativeCitations: null,
            tokensUsed: null,
            errorMessage: safeErrorMessage(err),
        };
    }
}
