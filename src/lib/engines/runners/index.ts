/**
 * Barrel for the PRD §F4 engine runners. Import from here to keep paths stable.
 */

export type {
    EngineId,
    EngineRunResult,
    RawCompletion,
    CompletionCaller,
} from './types';

export {
    withRetry,
    EngineTimeoutError,
    defaultIsRetryable,
    defaultGetRetryAfterMs,
    type WithRetryOptions,
} from './backoff';

export { executeEngineRun, type ExecuteEngineRunOptions } from './execute';

export {
    runChatGPT,
    chatgptCaller,
    getOpenAIClient,
    CHATGPT_MODEL,
    ENGINE_SYSTEM_PROMPT,
} from './chatgpt';

export {
    runPerplexity,
    perplexityCaller,
    getPerplexityClient,
    PERPLEXITY_MODEL,
    PERPLEXITY_BASE_URL,
} from './perplexity';
