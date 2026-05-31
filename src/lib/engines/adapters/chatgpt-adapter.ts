import OpenAI from 'openai';
import { CONFIG_DEFAULTS } from '@/lib/config/defaults';
import { BaseEngineAdapter } from '../base-adapter';
import { engineRegistry } from '../registry';
import {
    EngineAuthError,
    EngineError,
    EngineRateLimitError,
    EngineTimeoutError,
} from '../types';
import type {
    EngineExecutionResult,
    ExecutionContext,
    PromptInput,
    RateLimitConfig,
    StandardizedResponse,
} from '../types';

/**
 * Engine adapter for ChatGPT using the OpenAI Chat Completions API (gpt-4o-mini).
 *
 * Uses gpt-4o-mini — the cheapest OpenAI model that produces representative
 * answers for brand visibility monitoring.
 *
 * Validates: Requirement 4.4 (ChatGPT API), Requirement 18.6 (Circuit Breaker)
 */
export class ChatGPTAdapter extends BaseEngineAdapter {
    readonly engineId = 'chatgpt' as const;
    readonly engineName = 'ChatGPT (gpt-4o-mini)';

    private readonly model = 'gpt-4o-mini';
    private readonly costPerCall = 0.0015; // ~$0.0015/prompt

    private readonly client: OpenAI;

    constructor() {
        super();
        this.client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }

    /**
     * Execute a prompt against the ChatGPT API.
     *
     * Checks the circuit breaker before making any API call. Applies a hard
     * 30-second timeout (token burn protection). Maps HTTP error codes to
     * typed EngineError subclasses.
     */
    async execute(
        prompt: PromptInput,
        _context?: ExecutionContext,
    ): Promise<EngineExecutionResult> {
        // Circuit breaker check — must happen before any API call
        if (this.isCircuitOpen()) {
            return {
                success: false,
                error: new EngineError(
                    `ChatGPT circuit breaker is open — skipping call`,
                    this.engineId,
                    'api_error',
                    false,
                ),
            };
        }

        const timeoutMs = CONFIG_DEFAULTS['engines.timeout_ms'].value as number;
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

        const startTime = Date.now();

        try {
            const completion = await this.client.chat.completions.create(
                {
                    model: this.model,
                    max_tokens: 1000,
                    temperature: 0.3,
                    messages: [
                        {
                            role: 'system',
                            content:
                                'You are a helpful assistant. Answer the user\'s question thoroughly and accurately.',
                        },
                        {
                            role: 'user',
                            content: prompt.text,
                        },
                    ],
                },
                { signal: controller.signal },
            );

            clearTimeout(timeoutHandle);

            this.recordSuccess();

            const response = this.parseResponse({ completion, executionTimeMs: Date.now() - startTime });
            return { success: true, response };
        } catch (err: unknown) {
            clearTimeout(timeoutHandle);

            // AbortController fires when the timeout elapses
            if (
                err instanceof Error &&
                (err.name === 'AbortError' || err.message.toLowerCase().includes('abort'))
            ) {
                const timeoutError = new EngineTimeoutError(
                    this.engineId,
                    `ChatGPT call timed out after ${timeoutMs}ms`,
                    err,
                );
                this.recordFailure(timeoutError);
                throw timeoutError;
            }

            // Handle HTTP errors — check for a numeric `status` property which is
            // present on both the real OpenAI.APIError and the test mock.
            const httpStatus = (err as { status?: number }).status;
            if (typeof httpStatus === 'number') {
                if (httpStatus === 429) {
                    const rateLimitError = new EngineRateLimitError(
                        this.engineId,
                        `ChatGPT rate limit exceeded: ${err instanceof Error ? err.message : String(err)}`,
                        httpStatus,
                        err,
                    );
                    this.recordFailure(rateLimitError);
                    throw rateLimitError;
                }

                if (httpStatus === 401 || httpStatus === 403) {
                    const authError = new EngineAuthError(
                        this.engineId,
                        `ChatGPT authentication failed: ${err instanceof Error ? err.message : String(err)}`,
                        httpStatus,
                        err,
                    );
                    this.recordFailure(authError);
                    throw authError;
                }

                const apiError = new EngineError(
                    `ChatGPT API error (${httpStatus}): ${err instanceof Error ? err.message : String(err)}`,
                    this.engineId,
                    'api_error',
                    true,
                    httpStatus,
                    err,
                );
                this.recordFailure(apiError);
                throw apiError;
            }

            // Unknown / unexpected error
            const unknownError = new EngineError(
                `ChatGPT unexpected error: ${err instanceof Error ? err.message : String(err)}`,
                this.engineId,
                'unknown',
                true,
                undefined,
                err,
            );
            this.recordFailure(unknownError);
            throw unknownError;
        }
    }

    /**
     * Parse a raw OpenAI Chat Completions response into StandardizedResponse.
     *
     * ChatGPT does not return citations natively — the citations array is
     * always empty. Token usage is extracted when present.
     */
    parseResponse(raw: unknown): StandardizedResponse {
        const data = raw as {
            completion: OpenAI.Chat.Completions.ChatCompletion;
            executionTimeMs?: number;
        };

        const completion = data?.completion;
        const rawText = completion?.choices?.[0]?.message?.content ?? '';
        const modelVersion = completion?.model ?? this.model;
        const executionTimeMs = data?.executionTimeMs ?? 0;

        const tokenUsage =
            completion?.usage != null
                ? {
                    promptTokens: completion.usage.prompt_tokens,
                    completionTokens: completion.usage.completion_tokens,
                }
                : undefined;

        return {
            rawText,
            citations: [], // ChatGPT does not return citations natively
            metadata: {
                model: modelVersion,
                finishReason: completion?.choices?.[0]?.finish_reason ?? null,
            },
            modelVersion,
            timestamp: new Date(),
            executionTimeMs,
            tokenUsage,
        };
    }

    /**
     * Rate limit configuration for the OpenAI API.
     * requestsPerMinute is read from CONFIG_DEFAULTS.
     */
    getRateLimits(): RateLimitConfig {
        return {
            requestsPerMinute: CONFIG_DEFAULTS['engines.openai_rpm'].value as number,
            requestsPerDay: 10_000,
            cooldownMs: 1_000,
        };
    }

    /** Estimated cost per call in USD (~$0.0015/prompt for gpt-4o-mini). */
    getCostPerCall(): number {
        return this.costPerCall;
    }
}

// ── Auto-register when the module is imported (only if API key is present) ────
if (process.env.OPENAI_API_KEY) {
    engineRegistry.register(new ChatGPTAdapter());
}
