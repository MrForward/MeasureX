import type { EngineId, Citation } from '@/types';

/**
 * Common interface every engine integration must implement.
 *
 * Adding a new engine (e.g., Gemini in V2) means creating a new class that
 * implements this interface and registering it — no changes to the Scheduler,
 * Entity Extractor, or Metric Engine.
 *
 * Validates: Requirement 21 (Engine Extensibility)
 */
export interface EngineAdapter {
    readonly engineId: EngineId;
    readonly engineName: string;

    /** Execute a prompt against the engine and return a standardized response. */
    execute(prompt: PromptInput, context?: ExecutionContext): Promise<EngineExecutionResult>;

    /** Normalize a raw response into the standardized format. */
    parseResponse(raw: unknown): StandardizedResponse;

    /** Report current availability and circuit-breaker state. */
    getStatus(): EngineStatus;

    /** Report engine-specific rate limits. */
    getRateLimits(): RateLimitConfig;

    /** Estimated cost per call in USD. */
    getCostPerCall(): number;
}

export interface PromptInput {
    text: string;
    language: string;
    geography: string;
    /** Stable ID of the prompt record — used for traceability and deduplication. */
    promptId: string;
    /** Workspace this prompt belongs to — used for cost tracking and rate limiting. */
    workspaceId: string;
}

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
}

export interface StandardizedResponse {
    rawText: string;
    citations: Citation[];
    metadata: Record<string, unknown>;
    modelVersion: string;
    timestamp: Date;
    executionTimeMs: number;
    /** Optional token usage — populated when the engine API returns token counts. */
    tokenUsage?: TokenUsage;
}

export interface EngineStatus {
    available: boolean;
    consecutiveFailures: number;
    circuitBreakerOpen: boolean;
    lastSuccessAt: Date | null;
    lastFailureAt: Date | null;
    lastErrorMessage: string | null;
}

export interface RateLimitConfig {
    requestsPerMinute: number;
    requestsPerDay: number;
    cooldownMs: number;
}

// ── Engine Error ──────────────────────────────────────────────────────────────

export type EngineErrorCode =
    | 'rate_limit'
    | 'auth_error'
    | 'timeout'
    | 'parse_error'
    | 'api_error'
    | 'unknown';

/**
 * Typed engine error — allows callers to distinguish error categories
 * and decide whether to retry or escalate.
 *
 * Validates: Requirement 18.6 (Circuit Breaker)
 */
export class EngineError extends Error {
    constructor(
        message: string,
        public readonly engineId: string,
        public readonly code: EngineErrorCode,
        public readonly retryable: boolean,
        public readonly statusCode?: number,
        public readonly originalError?: unknown,
    ) {
        super(message);
        this.name = 'EngineError';
        // Maintain proper prototype chain in transpiled environments
        Object.setPrototypeOf(this, new.target.prototype);
    }

    /** Returns true if this error was caused by a rate limit (HTTP 429). */
    isRateLimitError(): boolean {
        return this.statusCode === 429;
    }

    /** Returns true if this error was caused by an auth failure (HTTP 401 or 403). */
    isAuthError(): boolean {
        return this.statusCode === 401 || this.statusCode === 403;
    }
}

/**
 * Thrown when an engine rejects the request due to invalid or expired credentials.
 * Not retryable — requires admin intervention.
 */
export class EngineAuthError extends EngineError {
    constructor(engineId: string, message: string, statusCode?: number, originalError?: unknown) {
        super(message, engineId, 'auth_error', false, statusCode, originalError);
        this.name = 'EngineAuthError';
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * Thrown when an engine returns a rate-limit response (HTTP 429 or equivalent).
 * Retryable after the cooldown period.
 */
export class EngineRateLimitError extends EngineError {
    constructor(engineId: string, message: string, statusCode?: number, originalError?: unknown) {
        super(message, engineId, 'rate_limit', true, statusCode, originalError);
        this.name = 'EngineRateLimitError';
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * Thrown when an engine call exceeds the configured timeout.
 * Retryable — transient network condition.
 */
export class EngineTimeoutError extends EngineError {
    constructor(engineId: string, message: string, originalError?: unknown) {
        super(message, engineId, 'timeout', true, undefined, originalError);
        this.name = 'EngineTimeoutError';
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * Thrown when the engine response cannot be parsed into StandardizedResponse.
 * Not retryable — requires adapter code fix.
 */
export class EngineParseError extends EngineError {
    constructor(engineId: string, message: string, originalError?: unknown) {
        super(message, engineId, 'parse_error', false, undefined, originalError);
        this.name = 'EngineParseError';
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

// ── Execution Result (discriminated union) ────────────────────────────────────

/**
 * Wraps the outcome of a single engine execution.
 * Callers check `success` before accessing `response` or `error`.
 */
export type EngineExecutionResult =
    | { success: true; response: StandardizedResponse }
    | { success: false; error: EngineError };

// ── Execution Context ─────────────────────────────────────────────────────────

/**
 * Execution context passed to execute() so adapters can log cost/metadata.
 * Carries run/prompt/workspace IDs through the pipeline for traceability.
 * attemptNumber tracks which retry attempt this is (1 = first try, up to 3).
 */
export interface ExecutionContext {
    runId: string;
    promptId: string;
    workspaceId: string;
    executionId: string;
    /** Which retry attempt this is: 1 (first try), 2, or 3 (final retry). */
    attemptNumber: number;
}

/**
 * Wraps StandardizedResponse with execution metadata for storage.
 * Pairs the response with the context and cost information.
 */
export interface TrackedResponse {
    response: StandardizedResponse;
    context: ExecutionContext;
    engine: EngineId;
    estimatedCostUsd: number;
}
