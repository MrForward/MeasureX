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

// ── SerpAPI response shape ────────────────────────────────────────────────────

interface SerpApiTextBlock {
    type: string;
    snippet: string;
}

interface SerpApiReference {
    title?: string;
    link: string;
    source?: string;
}

interface SerpApiAiOverview {
    text_blocks?: SerpApiTextBlock[];
    references?: SerpApiReference[];
}

interface SerpApiResponse {
    search_metadata?: {
        status?: string;
        created_at?: string;
    };
    ai_overview?: SerpApiAiOverview;
}

// ── Internal parsed shape passed to parseResponse ────────────────────────────

interface ParseInput {
    data: SerpApiResponse;
    executionTimeMs: number;
}

/**
 * Engine adapter for Google AI Overviews using the SerpAPI provider.
 *
 * IMPORTANT: Google does not always show AI Overviews. A missing `ai_overview`
 * field is a VALID data point (not an error) — it means Google chose not to
 * show an AI Overview for this query. The response is stored with empty rawText
 * and empty citations, and `metadata.hasAiOverview = false`.
 *
 * Uses native `fetch` with AbortController — no extra npm packages required.
 * SerpAPI free tier: 100 searches/month (~$0.01/call on paid plans).
 *
 * Validates: Requirement 4.5 (Google AI Overview), Requirement 4.7 (stale data
 * detection), Requirement 18.5 (stale data flagging), Requirement 18.6 (Circuit Breaker)
 */
export class GoogleAIAdapter extends BaseEngineAdapter {
    readonly engineId = 'google_ai' as const;
    readonly engineName = 'Google AI Overview (SerpAPI)';

    private readonly costPerCall = 0.01;
    private readonly serpApiBaseUrl = 'https://serpapi.com/search.json';

    /**
     * Execute a prompt against SerpAPI to retrieve Google AI Overview data.
     *
     * Circuit breaker is checked first. A 30-second hard timeout is applied
     * via AbortController. HTTP error codes are mapped to typed EngineError
     * subclasses. A missing AI Overview is NOT an error.
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
                    `Google AI circuit breaker is open — skipping call`,
                    this.engineId,
                    'api_error',
                    false,
                ),
            };
        }

        const apiKey = process.env.SERP_API_KEY;
        const timeoutMs = CONFIG_DEFAULTS['engines.timeout_ms'].value as number;

        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

        const startTime = Date.now();

        try {
            const url = `${this.serpApiBaseUrl}?q=${encodeURIComponent(prompt.text)}&api_key=${apiKey}&engine=google&num=10`;

            const res = await fetch(url, { signal: controller.signal });

            clearTimeout(timeoutHandle);

            // Map HTTP error codes to typed errors
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    const authError = new EngineAuthError(
                        this.engineId,
                        `Google AI (SerpAPI) authentication failed: HTTP ${res.status}`,
                        res.status,
                    );
                    this.recordFailure(authError);
                    throw authError;
                }

                if (res.status === 429) {
                    const rateLimitError = new EngineRateLimitError(
                        this.engineId,
                        `Google AI (SerpAPI) rate limit exceeded: HTTP ${res.status}`,
                        res.status,
                    );
                    this.recordFailure(rateLimitError);
                    throw rateLimitError;
                }

                const apiError = new EngineError(
                    `Google AI (SerpAPI) API error (${res.status}): ${res.statusText}`,
                    this.engineId,
                    'api_error',
                    true,
                    res.status,
                );
                this.recordFailure(apiError);
                throw apiError;
            }

            const data = (await res.json()) as SerpApiResponse;

            this.recordSuccess();

            const response = this.parseResponse({
                data,
                executionTimeMs: Date.now() - startTime,
            });
            return { success: true, response };
        } catch (err: unknown) {
            clearTimeout(timeoutHandle);

            // Re-throw typed errors we already created above
            if (
                err instanceof EngineAuthError ||
                err instanceof EngineRateLimitError ||
                err instanceof EngineError
            ) {
                throw err;
            }

            // AbortController fires when the timeout elapses
            if (
                err instanceof Error &&
                (err.name === 'AbortError' || err.message.toLowerCase().includes('abort'))
            ) {
                const timeoutError = new EngineTimeoutError(
                    this.engineId,
                    `Google AI (SerpAPI) call timed out after ${timeoutMs}ms`,
                    err,
                );
                this.recordFailure(timeoutError);
                throw timeoutError;
            }

            // Network / fetch error
            const networkError = new EngineError(
                `Google AI (SerpAPI) fetch error: ${err instanceof Error ? err.message : String(err)}`,
                this.engineId,
                'unknown',
                true,
                undefined,
                err,
            );
            this.recordFailure(networkError);
            throw networkError;
        }
    }

    /**
     * Parse a raw SerpAPI response into StandardizedResponse.
     *
     * KEY BEHAVIOUR: If `ai_overview` is absent from the SerpAPI response,
     * Google did not show an AI Overview for this query. This is a VALID data
     * point — we return rawText: '' and citations: [] with hasAiOverview: false.
     * We NEVER throw an error for a missing AI Overview.
     *
     * Stale data detection: `metadata.isStale` is true when
     * `search_metadata.created_at` is older than the configured threshold
     * (default 7 days from CONFIG_DEFAULTS 'notifications.stale_data_days').
     */
    parseResponse(raw: unknown): StandardizedResponse {
        const input = raw as ParseInput;
        const data = input?.data ?? {};
        const executionTimeMs = input?.executionTimeMs ?? 0;

        const aiOverview = data.ai_overview;
        const hasAiOverview = aiOverview !== undefined && aiOverview !== null;

        // Extract raw text — join paragraph snippets with newlines
        let rawText = '';
        if (hasAiOverview && aiOverview.text_blocks && aiOverview.text_blocks.length > 0) {
            rawText = aiOverview.text_blocks
                .filter((block) => block.type === 'paragraph' && block.snippet)
                .map((block) => block.snippet)
                .join('\n');
        }

        // Extract citations from references
        const citations: Citation[] = [];
        if (hasAiOverview && aiOverview.references && aiOverview.references.length > 0) {
            for (const ref of aiOverview.references) {
                if (!ref.link) continue;
                citations.push({
                    url: ref.link,
                    domain: ref.source ?? this.normalizeDomain(ref.link),
                    classification: 'other',
                });
            }
        }

        // Stale data detection
        const searchCreatedAt = data.search_metadata?.created_at ?? null;
        const staleDays = CONFIG_DEFAULTS['notifications.stale_data_days'].value as number;
        let isStale = false;
        if (searchCreatedAt) {
            const createdAtMs = new Date(searchCreatedAt).getTime();
            const ageMs = Date.now() - createdAtMs;
            const staleLimitMs = staleDays * 24 * 60 * 60 * 1000;
            isStale = ageMs > staleLimitMs;
        }

        return {
            rawText,
            citations,
            metadata: {
                hasAiOverview,
                searchCreatedAt,
                isStale,
            },
            modelVersion: 'google-ai-overview',
            timestamp: new Date(),
            executionTimeMs,
        };
    }

    /**
     * Normalize a URL to its base domain.
     * Strips protocol, www. prefix, and path.
     */
    private normalizeDomain(url: string): string {
        try {
            const parsed = new URL(url);
            return parsed.hostname.replace(/^www\./, '');
        } catch {
            return url
                .replace(/^https?:\/\//, '')
                .replace(/^www\./, '')
                .split('/')[0]
                .split('?')[0]
                .split('#')[0];
        }
    }

    /**
     * Rate limit configuration for SerpAPI.
     * requestsPerMinute is read from CONFIG_DEFAULTS 'engines.serp_rpm'.
     * requestsPerDay reflects the SerpAPI free tier limit (100 searches/month ≈ 3/day,
     * but we use 100 as the daily cap for paid plans).
     */
    getRateLimits(): RateLimitConfig {
        return {
            requestsPerMinute: CONFIG_DEFAULTS['engines.serp_rpm'].value as number,
            requestsPerDay: 100,
            cooldownMs: 2_000,
        };
    }

    /** Estimated cost per call in USD (~$0.01/call). */
    getCostPerCall(): number {
        return this.costPerCall;
    }
}

// ── Auto-register when the module is imported (only if API key is present) ────
if (process.env.SERP_API_KEY) {
    engineRegistry.register(new GoogleAIAdapter());
}
