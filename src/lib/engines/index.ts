/**
 * Barrel export for the engines module.
 *
 * Import engine types and base classes from here rather than from individual
 * files to keep import paths stable as the module grows.
 */

export type {
    EngineAdapter,
    EngineErrorCode,
    EngineExecutionResult,
    EngineStatus,
    ExecutionContext,
    PromptInput,
    RateLimitConfig,
    StandardizedResponse,
    TokenUsage,
    TrackedResponse,
} from './types';

export {
    EngineError,
    EngineAuthError,
    EngineRateLimitError,
    EngineTimeoutError,
    EngineParseError,
} from './types';

export { BaseEngineAdapter } from './base-adapter';

export { EngineRegistry, engineRegistry } from './registry';

export { executeWithRetry, delay } from './retry';
export type { RetryOptions } from './retry';

export { RateLimiter, EngineRateLimiterRegistry, engineRateLimiterRegistry } from './rate-limiter';
