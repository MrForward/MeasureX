/**
 * ModelRouter — centralized model selection, fallback chains, and cost tracking.
 *
 * This is the single place that decides WHICH model handles WHICH task. It
 * encodes the design doc's "Model & Agent Integration Instructions" table and
 * the "Cost Optimization Rules":
 *
 *   - Classification / disambiguation / strength → cheap models (Haiku, GPT-3.5)
 *   - Generation / suggestion                    → quality models (Sonnet, GPT-4o)
 *   - Fallback chains degrade CHEAP → CHEAP. Specifically, when Sonnet is
 *     unavailable we fall back to gpt-4o-mini, NOT gpt-4o (Cost Rule #5).
 *
 * CRITICAL — TOKEN BURN PROTECTION (matches the implementation-guide guardrails):
 *   - Every model call has a HARD TIMEOUT (default: engines.timeout_ms = 30s).
 *     A hung provider can never block the pipeline indefinitely.
 *   - The fallback chain is FINITE (primary + fixed fallbacks). `execute` walks
 *     the chain exactly once — it NEVER loops or retries infinitely.
 *   - Cost is tracked on every successful call so budget caps can act on it.
 *
 * Validates: Requirement 8.4 (cost-efficient models for classification)
 * Validates: Requirement 8.5 (expensive models reserved for generation)
 */

import { CONFIG_DEFAULTS } from '@/lib/config/defaults';
import { ModelTask, type ModelCaller, type ModelConfig } from './types';

/** Default per-call timeout (ms), sourced from the config registry (30s). */
export const DEFAULT_TIMEOUT_MS: number =
    typeof CONFIG_DEFAULTS['engines.timeout_ms']?.value === 'number'
        ? (CONFIG_DEFAULTS['engines.timeout_ms'].value as number)
        : 30_000;

/**
 * Thrown when EVERY model in a task's fallback chain fails. Carries the task
 * and the underlying errors so callers can alert / log without guessing.
 */
export class AllModelsFailedError extends Error {
    constructor(
        public readonly task: ModelTask,
        public readonly errors: unknown[],
    ) {
        super(`All models failed for task "${task}" (${errors.length} attempt(s))`);
        this.name = 'AllModelsFailedError';
        // Maintain proper prototype chain in transpiled environments.
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/** Result of a successful routed execution. */
export interface ExecuteResult {
    /** The model's raw text reply. */
    result: string;
    /** The model id that actually produced the result. */
    modelUsed: string;
    /** USD cost incurred by the successful call. */
    costIncurred: number;
}

/** Options for tuning router behaviour (kept minimal and injectable for tests). */
export interface ModelRouterOptions {
    /** Per-call hard timeout in ms. Defaults to DEFAULT_TIMEOUT_MS. */
    timeoutMs?: number;
}

// ── Model definitions ───────────────────────────────────────────────────────
// Cheap models — used for classification-style tasks (Cost Rule #1).

const CLAUDE_HAIKU: ModelConfig = {
    provider: 'anthropic',
    model: 'claude-3-5-haiku',
    maxTokens: 1024,
    temperature: 0,
    costPerCall: 0.0003,
};

const GPT_35_TURBO: ModelConfig = {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    maxTokens: 1024,
    temperature: 0,
    costPerCall: 0.0005,
};

const GPT_4O_MINI: ModelConfig = {
    provider: 'openai',
    model: 'gpt-4o-mini',
    maxTokens: 2048,
    temperature: 0.2,
    costPerCall: 0.0015,
};

// Quality models — reserved for generation tasks only (Cost Rule #1).

const CLAUDE_SONNET: ModelConfig = {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet',
    maxTokens: 4096,
    temperature: 0.4,
    costPerCall: 0.01,
};

/**
 * Static task → fallback-chain map. The FIRST entry is the primary model; the
 * remaining entries are fallbacks tried in order. Chains are deliberately short
 * and finite (token burn protection — no infinite retry).
 *
 * Note the generation tasks fall back Sonnet → gpt-4o-mini (cheap), never
 * Sonnet → gpt-4o (Cost Rule #5).
 */
const TASK_CHAINS: Record<ModelTask, readonly ModelConfig[]> = {
    [ModelTask.ENTITY_CLASSIFICATION]: [CLAUDE_HAIKU, GPT_35_TURBO],
    [ModelTask.CONTEXT_DISAMBIGUATION]: [CLAUDE_HAIKU, GPT_4O_MINI],
    [ModelTask.RECOMMENDATION_STRENGTH]: [CLAUDE_HAIKU, GPT_35_TURBO],
    [ModelTask.RECOMMENDATION_GENERATION]: [CLAUDE_SONNET, GPT_4O_MINI],
    [ModelTask.PROMPT_SUGGESTION]: [CLAUDE_SONNET, GPT_4O_MINI],
};

/**
 * Runs `promise` against a hard timeout. If the timeout fires first the
 * returned promise rejects, freeing the caller to try the next model in the
 * chain. The timer is always cleared so it never leaks.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Model call timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (err) => {
                clearTimeout(timer);
                reject(err);
            },
        );
    });
}

export class ModelRouter {
    private readonly caller: ModelCaller;
    private readonly timeoutMs: number;
    private totalCost = 0;

    constructor(caller: ModelCaller, options?: ModelRouterOptions) {
        this.caller = caller;
        this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    }

    /** Return the PRIMARY model config for a task (first entry of its chain). */
    route(task: ModelTask): ModelConfig {
        return this.getFallbackChain(task)[0];
    }

    /**
     * Return the full fallback chain for a task: the primary model first, then
     * its fallbacks in priority order. Returns copies so callers can't mutate
     * the shared static definitions.
     */
    getFallbackChain(task: ModelTask): ModelConfig[] {
        return TASK_CHAINS[task].map((config) => ({ ...config }));
    }

    /**
     * Execute a task by walking its fallback chain until one model succeeds.
     *
     * Behaviour:
     *   - Try each model in order; each call is bounded by a hard timeout.
     *   - On success: add the model's costPerCall to the running total and
     *     return the result, the model used, and the cost incurred.
     *   - On failure (throw or timeout): record the error and try the next.
     *   - If EVERY model fails: throw AllModelsFailedError.
     *
     * The chain is finite, so this walks each model exactly once — there is no
     * infinite retry (token burn protection).
     */
    async execute(task: ModelTask, prompt: string): Promise<ExecuteResult> {
        const chain = this.getFallbackChain(task);
        const errors: unknown[] = [];

        for (const config of chain) {
            try {
                const result = await withTimeout(
                    this.caller.call(config, prompt),
                    this.timeoutMs,
                );
                // Only successful calls incur cost.
                this.totalCost += config.costPerCall;
                return {
                    result,
                    modelUsed: config.model,
                    costIncurred: config.costPerCall,
                };
            } catch (error) {
                // Record and fall through to the next model in the chain.
                errors.push(error);
            }
        }

        throw new AllModelsFailedError(task, errors);
    }

    /** Cumulative USD cost incurred across all successful calls. */
    getTotalCost(): number {
        return this.totalCost;
    }

    /** Reset the cumulative cost counter to zero (e.g. per-run accounting). */
    resetCost(): void {
        this.totalCost = 0;
    }
}
