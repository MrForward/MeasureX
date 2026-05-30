import type { StandardizedResponse } from '@/types';

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
    readonly engineId: string;
    readonly engineName: string;

    /** Execute a prompt against the engine and return a raw response. */
    execute(prompt: PromptInput): Promise<unknown>;

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
}

export interface EngineStatus {
    available: boolean;
    consecutiveFailures: number;
    circuitBreakerOpen: boolean;
    lastSuccessAt: Date | null;
}

export interface RateLimitConfig {
    requestsPerMinute: number;
    requestsPerDay: number;
    cooldownMs: number;
}
