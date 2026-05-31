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
import type { Citation } from '@/types';

/**
 * Engine adapter for Perplexity using the Sonar API.
 *
 * Perplexity uses an OpenAI-compatible API (same SDK, different base URL).
 * The key differentiator is that Perplexity returns citations natively in
 * the response — these are extracted and normalized into the StandardizedResponse.
 *
 * Validates: Requirement 4.3 (Perplexity Sonar API), Requirement 5.3 (URL extraction)
 */
export class PerplexityAdapter extends BaseEngineAdapter {
    readonly engineId = 'perplexity' as const;
    readonly engineName = 'Perplexity (Sonar)';

    private readonly model = 'sonar';
    private readonly costPerCall = 0.005; // ~$0.005/call

    private readonly client: OpenAI;

    constructor() {
        super();
        this.client = new OpenAI({
            apiKey: process.env.PERPLEXITY_API_KEY,
            baseURL: 'https://api.perplexity.ai',
        });
    }

    /**
     * Execute a prompt against the Perplexity Sonar API.
     *
     * Checks the circuit breaker before making any API call. Applies a hard
     * 30-second timeout (token burn protection). Maps HTTP error codes to
     * typed EngineError subclasses.
     *
     * KEY DIFFERENCE from ChatGPT: Perplexity returns citations natively in
     * the response object, which are extracted in parseResponse().
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
                    `Perplexity circuit breaker is open — skipping call`,
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
                    messages: [
                        {
                            role: 'system',
                            content:
                                'Be precise and concise. Provide accurate, well-sourced information.',
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
                    `Perplexity call timed out after ${timeoutMs}ms`,
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
                        `Perplexity rate limit exceeded: ${err instanceof Error ? err.message : String(err)}`,
                        httpStatus,
                        err,
                    );
                    this.recordFailure(rateLimitError);
                    throw rateLimitError;
                }

                if (httpStatus === 401 || httpStatus === 403) {
                    const authError = new EngineAuthError(
                        this.engineId,
                        `Perplexity authentication failed: ${err instanceof Error ? err.message : String(err)}`,
                        httpStatus,
                        err,
                    );
                    this.recordFailure(authError);
                    throw authError;
                }

                const apiError = new EngineError(
                    `Perplexity API error (${httpStatus}): ${err instanceof Error ? err.message : String(err)}`,
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
                `Perplexity unexpected error: ${err instanceof Error ? err.message : String(err)}`,
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
     * Parse a raw Perplexity Sonar response into StandardizedResponse.
     *
     * KEY DIFFERENCE from ChatGPT: Perplexity returns a `citations` array of
     * URL strings natively in the response. These are extracted and normalized
     * to base domains. Classification happens downstream in the extraction pipeline.
     *
     * Perplexity response shape:
     * {
     *   "choices": [{ "message": { "content": "..." } }],
     *   "citations": ["https://example.com/path", ...]
     * }
     */
    parseResponse(raw: unknown): StandardizedResponse {
        const data = raw as {
            completion: OpenAI.Chat.Completions.ChatCompletion & { citations?: string[] };
            executionTimeMs?: number;
        };

        const completion = data?.completion;
        const rawText = completion?.choices?.[0]?.message?.content ?? '';
        const modelVersion = completion?.model ?? this.model;
        const executionTimeMs = data?.executionTimeMs ?? 0;

        // Extract citations — Perplexity's primary value-add
        const rawCitations: string[] = completion?.citations ?? [];
        const citations: Citation[] = rawCitations.map((url) => ({
            url,
            domain: this.normalizeDomain(url),
            classification: 'other', // Classification happens in Phase 3 extraction pipeline
        }));

        return {
            rawText,
            citations,
            metadata: {
                model: modelVersion,
                finishReason: completion?.choices?.[0]?.finish_reason ?? null,
                citationCount: citations.length,
            },
            modelVersion,
            timestamp: new Date(),
            executionTimeMs,
        };
    }

    /**
     * Normalize a citation URL to its base domain.
     *
     * Strips protocol, www. prefix, and path — returns just the bare domain.
     * Examples:
     *   https://www.hubspot.com/blog/crm  → hubspot.com
     *   https://salesforce.com            → salesforce.com
     *   http://www.example.co.uk/path     → example.co.uk
     */
    private normalizeDomain(url: string): string {
        try {
            // Use URL constructor for robust parsing
            const parsed = new URL(url);
            // Remove www. prefix from hostname
            return parsed.hostname.replace(/^www\./, '');
        } catch {
            // Fallback: strip protocol and www. manually for malformed URLs
            return url
                .replace(/^https?:\/\//, '')
                .replace(/^www\./, '')
                .split('/')[0]
                .split('?')[0]
                .split('#')[0];
        }
    }

    /**
     * Rate limit configuration for the Perplexity API.
     * requestsPerMinute is read from CONFIG_DEFAULTS.
     */
    getRateLimits(): RateLimitConfig {
        return {
            requestsPerMinute: CONFIG_DEFAULTS['engines.perplexity_rpm'].value as number,
            requestsPerDay: 5_000,
            cooldownMs: 1_200,
        };
    }

    /** Estimated cost per call in USD (~$0.005/call for Sonar). */
    getCostPerCall(): number {
        return this.costPerCall;
    }
}

// ── Auto-register when the module is imported (only if API key is present) ────
if (process.env.PERPLEXITY_API_KEY) {
    engineRegistry.register(new PerplexityAdapter());
}
