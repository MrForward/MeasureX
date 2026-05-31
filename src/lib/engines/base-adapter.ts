import { CONFIG_DEFAULTS } from '@/lib/config/defaults';
import type { EngineId } from '@/types';
import type {
    EngineAdapter,
    EngineExecutionResult,
    EngineStatus,
    ExecutionContext,
    PromptInput,
    RateLimitConfig,
    StandardizedResponse,
} from './types';
import { EngineError } from './types';

/**
 * Abstract base class for all engine adapters.
 *
 * Provides shared circuit-breaker state management so concrete adapters only
 * need to implement the engine-specific logic (execute, parseResponse,
 * getRateLimits, getCostPerCall). The circuit breaker thresholds are read from
 * CONFIG_DEFAULTS so they can be tuned at runtime without a redeploy.
 *
 * Circuit breaker logic:
 *   - After N consecutive failures (default 5): circuitBreakerOpen = true
 *   - After pause duration (default 30min): auto-reset and try again
 *   - On any success: reset consecutiveFailures to 0, circuitBreakerOpen = false
 *
 * Validates: Requirement 18.6 (Circuit Breaker), Requirement 21 (Engine Extensibility)
 */
export abstract class BaseEngineAdapter implements EngineAdapter {
    abstract readonly engineId: EngineId;
    abstract readonly engineName: string;

    // ── Circuit Breaker State ─────────────────────────────────────────────────

    protected consecutiveFailures = 0;
    protected circuitBreakerOpen = false;
    protected lastSuccessAt: Date | null = null;
    protected lastFailureAt: Date | null = null;
    protected lastErrorMessage: string | null = null;
    protected circuitOpenedAt: Date | null = null;

    // ── Config Accessors (read from CONFIG_DEFAULTS, not hardcoded) ───────────
    //
    // We read from CONFIG_DEFAULTS synchronously here because circuit-breaker
    // checks must be synchronous (called in hot paths). The platform config
    // system (config.get) is async and intended for request-time lookups.
    // If you need runtime-overridable thresholds, cache them at adapter
    // construction time via an async factory.

    private get failureThreshold(): number {
        return CONFIG_DEFAULTS['engines.circuit_breaker_failures'].value as number;
    }

    private get pauseDurationMs(): number {
        return CONFIG_DEFAULTS['engines.circuit_breaker_pause_ms'].value as number;
    }

    // ── Circuit Breaker Methods ───────────────────────────────────────────────

    /**
     * Check whether the circuit is currently open (i.e., calls should be blocked).
     * Auto-resets the circuit if the pause duration has elapsed since it opened.
     */
    isCircuitOpen(): boolean {
        if (!this.circuitBreakerOpen) return false;

        // Auto-reset after pause duration
        if (this.circuitOpenedAt !== null) {
            const elapsed = Date.now() - this.circuitOpenedAt.getTime();
            if (elapsed >= this.pauseDurationMs) {
                this.circuitBreakerOpen = false;
                this.consecutiveFailures = 0;
                this.circuitOpenedAt = null;
                return false;
            }
        }

        return true;
    }

    /**
     * Record a successful execution. Resets the circuit breaker state.
     */
    recordSuccess(): void {
        this.consecutiveFailures = 0;
        this.circuitBreakerOpen = false;
        this.circuitOpenedAt = null;
        this.lastSuccessAt = new Date();
    }

    /**
     * Record a failed execution. Opens the circuit after N consecutive failures.
     * Stores the error message for observability via getStatus().
     */
    recordFailure(error: EngineError): void {
        this.consecutiveFailures += 1;
        this.lastFailureAt = new Date();
        this.lastErrorMessage = error.message;

        if (this.consecutiveFailures >= this.failureThreshold && !this.circuitBreakerOpen) {
            this.circuitBreakerOpen = true;
            this.circuitOpenedAt = new Date();
        }
    }

    // ── EngineAdapter: getStatus (concrete — adapters don't need to override) ─

    getStatus(): EngineStatus {
        return {
            available: !this.isCircuitOpen(),
            consecutiveFailures: this.consecutiveFailures,
            circuitBreakerOpen: this.circuitBreakerOpen,
            lastSuccessAt: this.lastSuccessAt,
            lastFailureAt: this.lastFailureAt,
            lastErrorMessage: this.lastErrorMessage,
        };
    }

    // ── Abstract Methods (concrete adapters must implement) ───────────────────

    abstract execute(
        prompt: PromptInput,
        context?: ExecutionContext,
    ): Promise<EngineExecutionResult>;

    abstract parseResponse(raw: unknown): StandardizedResponse;

    abstract getRateLimits(): RateLimitConfig;

    abstract getCostPerCall(): number;
}
