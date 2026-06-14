/**
 * Engine-runner types (PRD §F4).
 *
 * The MVP runs exactly two engines. A runner takes a prompt and returns a
 * normalized {@link EngineRunResult} ready to persist as an `EngineRun` row —
 * never throwing: a failed call is a `status: 'failed'` result, not an exception.
 */

export type EngineId = 'chatgpt' | 'perplexity';

/** Result of a single prompt-engine call, shaped for the `EngineRun` table. */
export interface EngineRunResult {
    engine: EngineId;
    model: string;
    status: 'completed' | 'failed';
    /** Full response text (null when the call failed). */
    rawResponse: string | null;
    /** Engine-native citation URLs (Perplexity); `[]` for ChatGPT; null on failure. */
    nativeCitations: string[] | null;
    tokensUsed: number | null;
    errorMessage: string | null;
}

/**
 * A normalized completion produced by a low-level engine caller, before it is
 * wrapped into an {@link EngineRunResult}. Decouples the retry/result layer from
 * the OpenAI SDK so the former is unit-testable without network access.
 */
export interface RawCompletion {
    content: string;
    /** Native citation URLs, if the engine returns them. */
    citations?: string[];
    tokensUsed?: number | null;
    model?: string;
}

/** Performs ONE engine call, honoring the abort signal for timeout enforcement. */
export type CompletionCaller = (signal: AbortSignal) => Promise<RawCompletion>;
