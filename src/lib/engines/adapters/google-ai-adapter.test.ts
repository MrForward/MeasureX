import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ── Hoist the shared fetch mock so it's available inside vi.mock factory ──────
const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

// ── Mock global fetch before importing the adapter ────────────────────────────
vi.stubGlobal('fetch', mockFetch);

// Import after mocking
import { GoogleAIAdapter } from './google-ai-adapter';
import {
    EngineAuthError,
    EngineRateLimitError,
    EngineTimeoutError,
    EngineError,
} from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePromptInput() {
    return {
        text: 'What is the best CRM software?',
        language: 'en',
        geography: 'US',
        promptId: 'prompt-123',
        workspaceId: 'ws-456',
    };
}

/** Build a mock SerpAPI response with an AI Overview present. */
function makeSerpApiResponse(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        search_metadata: {
            status: 'Success',
            created_at: new Date().toISOString(), // fresh by default
        },
        ai_overview: {
            text_blocks: [
                { type: 'paragraph', snippet: 'HubSpot is a CRM platform used by thousands of businesses.' },
                { type: 'paragraph', snippet: 'It offers marketing, sales, and service tools.' },
            ],
            references: [
                { title: 'HubSpot Blog', link: 'https://hubspot.com/blog', source: 'hubspot.com' },
                { title: 'G2 Reviews', link: 'https://www.g2.com/categories/crm', source: 'g2.com' },
            ],
        },
        ...overrides,
    };
}

/** Build a mock SerpAPI response WITHOUT an AI Overview (valid data point). */
function makeSerpApiResponseNoOverview(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        search_metadata: {
            status: 'Success',
            created_at: new Date().toISOString(),
        },
        // ai_overview intentionally absent
        ...overrides,
    };
}

/** Create a mock fetch Response with a given status and JSON body. */
function makeFetchResponse(status: number, body: unknown): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : `HTTP ${status}`,
        json: vi.fn().mockResolvedValue(body),
    } as unknown as Response;
}

/** ISO date string N days ago. */
function daysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GoogleAIAdapter', () => {
    let adapter: GoogleAIAdapter;

    beforeEach(() => {
        mockFetch.mockReset();
        adapter = new GoogleAIAdapter();
        // Provide a fake API key so the URL is built correctly
        process.env.SERP_API_KEY = 'test-serp-key';
    });

    afterEach(() => {
        vi.clearAllMocks();
        delete process.env.SERP_API_KEY;
    });

    // ── identity ──────────────────────────────────────────────────────────────

    describe('identity', () => {
        it('has engineId "google_ai"', () => {
            expect(adapter.engineId).toBe('google_ai');
        });

        it('has correct engineName', () => {
            expect(adapter.engineName).toBe('Google AI Overview (SerpAPI)');
        });
    });

    // ── execute() — success with AI Overview ─────────────────────────────────

    describe('execute() — success with AI Overview', () => {
        it('returns success result with rawText and citations when AI Overview is present', async () => {
            mockFetch.mockResolvedValueOnce(
                makeFetchResponse(200, makeSerpApiResponse()),
            );

            const result = await adapter.execute(makePromptInput());

            expect(result.success).toBe(true);
            if (!result.success) return;

            expect(result.response.rawText).toContain('HubSpot is a CRM platform');
            expect(result.response.citations).toHaveLength(2);
            expect(result.response.citations[0].url).toBe('https://hubspot.com/blog');
            expect(result.response.citations[0].domain).toBe('hubspot.com');
            expect(result.response.citations[0].classification).toBe('other');
        });

        it('calls recordSuccess after a successful API call', async () => {
            mockFetch.mockResolvedValueOnce(
                makeFetchResponse(200, makeSerpApiResponse()),
            );
            const spy = vi.spyOn(adapter, 'recordSuccess');

            await adapter.execute(makePromptInput());

            expect(spy).toHaveBeenCalledOnce();
        });

        it('returns a timestamp as a Date instance', async () => {
            mockFetch.mockResolvedValueOnce(
                makeFetchResponse(200, makeSerpApiResponse()),
            );

            const result = await adapter.execute(makePromptInput());

            expect(result.success).toBe(true);
            if (!result.success) return;
            expect(result.response.timestamp).toBeInstanceOf(Date);
        });
    });

    // ── execute() — success WITHOUT AI Overview (valid data point) ────────────

    describe('execute() — success without AI Overview (valid data point)', () => {
        it('returns success with empty rawText when no AI Overview is present', async () => {
            mockFetch.mockResolvedValueOnce(
                makeFetchResponse(200, makeSerpApiResponseNoOverview()),
            );

            const result = await adapter.execute(makePromptInput());

            expect(result.success).toBe(true);
            if (!result.success) return;

            expect(result.response.rawText).toBe('');
            expect(result.response.citations).toEqual([]);
        });

        it('sets metadata.hasAiOverview = false when no AI Overview is present', async () => {
            mockFetch.mockResolvedValueOnce(
                makeFetchResponse(200, makeSerpApiResponseNoOverview()),
            );

            const result = await adapter.execute(makePromptInput());

            expect(result.success).toBe(true);
            if (!result.success) return;

            expect(result.response.metadata.hasAiOverview).toBe(false);
        });

        it('does NOT throw an error when AI Overview is absent', async () => {
            mockFetch.mockResolvedValueOnce(
                makeFetchResponse(200, makeSerpApiResponseNoOverview()),
            );

            await expect(adapter.execute(makePromptInput())).resolves.not.toThrow();
        });
    });

    // ── execute() — circuit breaker open ─────────────────────────────────────

    describe('execute() — circuit breaker open', () => {
        it('returns a failure result without calling fetch when circuit is open', async () => {
            const error = new EngineError('fail', 'google_ai', 'api_error', true);
            for (let i = 0; i < 5; i++) {
                adapter.recordFailure(error);
            }
            expect(adapter.isCircuitOpen()).toBe(true);

            const result = await adapter.execute(makePromptInput());

            expect(result.success).toBe(false);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('returns an EngineError when circuit is open', async () => {
            const error = new EngineError('fail', 'google_ai', 'api_error', true);
            for (let i = 0; i < 5; i++) {
                adapter.recordFailure(error);
            }

            const result = await adapter.execute(makePromptInput());

            expect(result.success).toBe(false);
            if (result.success) return;
            expect(result.error).toBeInstanceOf(EngineError);
        });
    });

    // ── execute() — error handling ────────────────────────────────────────────

    describe('execute() — error handling', () => {
        it('throws EngineAuthError on HTTP 401', async () => {
            mockFetch.mockResolvedValueOnce(makeFetchResponse(401, {}));

            await expect(adapter.execute(makePromptInput())).rejects.toBeInstanceOf(
                EngineAuthError,
            );
        });

        it('throws EngineAuthError on HTTP 403', async () => {
            mockFetch.mockResolvedValueOnce(makeFetchResponse(403, {}));

            await expect(adapter.execute(makePromptInput())).rejects.toBeInstanceOf(
                EngineAuthError,
            );
        });

        it('throws EngineRateLimitError on HTTP 429', async () => {
            mockFetch.mockResolvedValueOnce(makeFetchResponse(429, {}));

            await expect(adapter.execute(makePromptInput())).rejects.toBeInstanceOf(
                EngineRateLimitError,
            );
        });

        it('throws EngineError on other HTTP errors (e.g. 500)', async () => {
            mockFetch.mockResolvedValueOnce(makeFetchResponse(500, {}));

            await expect(adapter.execute(makePromptInput())).rejects.toBeInstanceOf(
                EngineError,
            );
        });

        it('throws EngineTimeoutError when AbortController fires', async () => {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            mockFetch.mockRejectedValueOnce(abortError);

            await expect(adapter.execute(makePromptInput())).rejects.toBeInstanceOf(
                EngineTimeoutError,
            );
        });

        it('throws EngineError on network/fetch errors', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network failure'));

            await expect(adapter.execute(makePromptInput())).rejects.toBeInstanceOf(
                EngineError,
            );
        });

        it('calls recordFailure on HTTP errors', async () => {
            mockFetch.mockResolvedValueOnce(makeFetchResponse(500, {}));
            const spy = vi.spyOn(adapter, 'recordFailure');

            await expect(adapter.execute(makePromptInput())).rejects.toThrow();
            expect(spy).toHaveBeenCalledOnce();
        });
    });

    // ── parseResponse() ───────────────────────────────────────────────────────

    describe('parseResponse()', () => {
        it('joins text_blocks paragraphs into rawText with newlines', () => {
            const data = makeSerpApiResponse();
            const response = adapter.parseResponse({ data, executionTimeMs: 100 });

            expect(response.rawText).toBe(
                'HubSpot is a CRM platform used by thousands of businesses.\nIt offers marketing, sales, and service tools.',
            );
        });

        it('extracts citations from references array', () => {
            const data = makeSerpApiResponse();
            const response = adapter.parseResponse({ data, executionTimeMs: 100 });

            expect(response.citations).toHaveLength(2);
            expect(response.citations[0].url).toBe('https://hubspot.com/blog');
            expect(response.citations[0].domain).toBe('hubspot.com');
            expect(response.citations[1].url).toBe('https://www.g2.com/categories/crm');
            expect(response.citations[1].domain).toBe('g2.com');
        });

        it('classifies all citations as "other"', () => {
            const data = makeSerpApiResponse();
            const response = adapter.parseResponse({ data, executionTimeMs: 100 });

            for (const citation of response.citations) {
                expect(citation.classification).toBe('other');
            }
        });

        it('sets metadata.hasAiOverview = true when AI Overview is present', () => {
            const data = makeSerpApiResponse();
            const response = adapter.parseResponse({ data, executionTimeMs: 100 });

            expect(response.metadata.hasAiOverview).toBe(true);
        });

        it('sets metadata.hasAiOverview = false when AI Overview is absent', () => {
            const data = makeSerpApiResponseNoOverview();
            const response = adapter.parseResponse({ data, executionTimeMs: 100 });

            expect(response.metadata.hasAiOverview).toBe(false);
        });

        it('returns rawText = "" and citations = [] when AI Overview is absent', () => {
            const data = makeSerpApiResponseNoOverview();
            const response = adapter.parseResponse({ data, executionTimeMs: 100 });

            expect(response.rawText).toBe('');
            expect(response.citations).toEqual([]);
        });

        it('sets metadata.isStale = true for data older than 7 days', () => {
            const data = makeSerpApiResponse({
                search_metadata: {
                    status: 'Success',
                    created_at: daysAgo(8), // 8 days old → stale
                },
            });
            const response = adapter.parseResponse({ data, executionTimeMs: 100 });

            expect(response.metadata.isStale).toBe(true);
        });

        it('sets metadata.isStale = false for fresh data (within 7 days)', () => {
            const data = makeSerpApiResponse({
                search_metadata: {
                    status: 'Success',
                    created_at: daysAgo(1), // 1 day old → fresh
                },
            });
            const response = adapter.parseResponse({ data, executionTimeMs: 100 });

            expect(response.metadata.isStale).toBe(false);
        });

        it('sets metadata.searchCreatedAt from search_metadata.created_at', () => {
            const createdAt = '2024-01-15T10:00:00Z';
            const data = makeSerpApiResponse({
                search_metadata: { status: 'Success', created_at: createdAt },
            });
            const response = adapter.parseResponse({ data, executionTimeMs: 100 });

            expect(response.metadata.searchCreatedAt).toBe(createdAt);
        });

        it('uses modelVersion = "google-ai-overview" (static)', () => {
            const data = makeSerpApiResponse();
            const response = adapter.parseResponse({ data, executionTimeMs: 100 });

            expect(response.modelVersion).toBe('google-ai-overview');
        });

        it('returns a timestamp as a Date instance', () => {
            const data = makeSerpApiResponse();
            const response = adapter.parseResponse({ data, executionTimeMs: 100 });

            expect(response.timestamp).toBeInstanceOf(Date);
        });

        it('preserves executionTimeMs from the raw input', () => {
            const data = makeSerpApiResponse();
            const response = adapter.parseResponse({ data, executionTimeMs: 420 });

            expect(response.executionTimeMs).toBe(420);
        });

        it('normalizes domain from link when source is absent', () => {
            const data = makeSerpApiResponse({
                ai_overview: {
                    text_blocks: [{ type: 'paragraph', snippet: 'Some text.' }],
                    references: [
                        { title: 'Example', link: 'https://www.example.com/some/path' },
                        // no source field
                    ],
                },
            });
            const response = adapter.parseResponse({ data, executionTimeMs: 100 });

            expect(response.citations[0].domain).toBe('example.com');
        });

        it('handles empty text_blocks gracefully', () => {
            const data = makeSerpApiResponse({
                ai_overview: {
                    text_blocks: [],
                    references: [],
                },
            });
            const response = adapter.parseResponse({ data, executionTimeMs: 100 });

            expect(response.rawText).toBe('');
            expect(response.citations).toEqual([]);
        });

        it('skips non-paragraph text_blocks when building rawText', () => {
            const data = makeSerpApiResponse({
                ai_overview: {
                    text_blocks: [
                        { type: 'paragraph', snippet: 'First paragraph.' },
                        { type: 'list', snippet: 'List item (should be skipped).' },
                        { type: 'paragraph', snippet: 'Second paragraph.' },
                    ],
                    references: [],
                },
            });
            const response = adapter.parseResponse({ data, executionTimeMs: 100 });

            expect(response.rawText).toBe('First paragraph.\nSecond paragraph.');
        });
    });

    // ── getCostPerCall() ──────────────────────────────────────────────────────

    describe('getCostPerCall()', () => {
        it('returns 0.01', () => {
            expect(adapter.getCostPerCall()).toBe(0.01);
        });
    });

    // ── getRateLimits() ───────────────────────────────────────────────────────

    describe('getRateLimits()', () => {
        it('returns requestsPerMinute of 30 (from CONFIG_DEFAULTS engines.serp_rpm)', () => {
            expect(adapter.getRateLimits().requestsPerMinute).toBe(30);
        });

        it('returns requestsPerDay of 100 (SerpAPI free tier limit)', () => {
            expect(adapter.getRateLimits().requestsPerDay).toBe(100);
        });

        it('returns cooldownMs of 2000', () => {
            expect(adapter.getRateLimits().cooldownMs).toBe(2_000);
        });
    });
});
