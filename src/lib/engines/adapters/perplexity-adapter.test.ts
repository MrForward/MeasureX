import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ── Hoist the shared mock so it's available inside vi.mock factory ────────────
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

// ── Mock the OpenAI module before importing the adapter ───────────────────────
vi.mock('openai', () => {
    const MockOpenAI = vi.fn().mockImplementation(() => ({
        chat: {
            completions: {
                create: mockCreate,
            },
        },
    }));

    // Attach APIError as a static class on the mock constructor so that
    // the adapter can check `err.status` (same duck-typing as the real SDK).
    class APIError extends Error {
        status: number;
        constructor(message: string, status: number) {
            super(message);
            this.name = 'APIError';
            this.status = status;
        }
    }

    (MockOpenAI as unknown as Record<string, unknown>).APIError = APIError;

    return { default: MockOpenAI };
});

// Import after mocking
import { PerplexityAdapter } from './perplexity-adapter';
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

/**
 * Build a mock Perplexity Sonar API response.
 * Perplexity extends the OpenAI response shape with a top-level `citations` array.
 */
function makePerplexityCompletion(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        id: 'perp-abc123',
        object: 'chat.completion',
        created: 1700000000,
        model: 'sonar',
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content: 'HubSpot is a leading CRM platform used by thousands of businesses.',
                },
                finish_reason: 'stop',
            },
        ],
        citations: [
            'https://www.hubspot.com/blog/crm',
            'https://salesforce.com/products/crm',
            'https://www.g2.com/categories/crm',
        ],
        ...overrides,
    };
}

/** Create a mock HTTP error with a numeric `status` property. */
function makeAPIError(message: string, status: number): Error {
    const err = new Error(message);
    (err as Error & { status: number }).status = status;
    return err;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PerplexityAdapter', () => {
    let adapter: PerplexityAdapter;

    beforeEach(() => {
        mockCreate.mockReset();
        adapter = new PerplexityAdapter();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    // ── execute() — success path ──────────────────────────────────────────────

    describe('execute() — success', () => {
        it('returns a success result with citations populated', async () => {
            mockCreate.mockResolvedValueOnce(makePerplexityCompletion());

            const result = await adapter.execute(makePromptInput());

            expect(result.success).toBe(true);
            if (!result.success) return; // type narrowing

            expect(result.response.rawText).toBe(
                'HubSpot is a leading CRM platform used by thousands of businesses.',
            );
            expect(result.response.citations).toHaveLength(3);
            expect(result.response.citations[0].url).toBe('https://www.hubspot.com/blog/crm');
            expect(result.response.citations[0].domain).toBe('hubspot.com');
            expect(result.response.citations[0].classification).toBe('other');
        });

        it('returns empty citations when API returns no citations', async () => {
            mockCreate.mockResolvedValueOnce(makePerplexityCompletion({ citations: [] }));

            const result = await adapter.execute(makePromptInput());

            expect(result.success).toBe(true);
            if (!result.success) return;

            expect(result.response.citations).toEqual([]);
        });

        it('returns empty citations when API omits the citations field', async () => {
            const completionWithoutCitations = makePerplexityCompletion();
            // Remove citations entirely
            delete (completionWithoutCitations as Record<string, unknown>).citations;
            mockCreate.mockResolvedValueOnce(completionWithoutCitations);

            const result = await adapter.execute(makePromptInput());

            expect(result.success).toBe(true);
            if (!result.success) return;

            expect(result.response.citations).toEqual([]);
        });

        it('returns correct modelVersion from the response', async () => {
            mockCreate.mockResolvedValueOnce(makePerplexityCompletion({ model: 'sonar-pro' }));

            const result = await adapter.execute(makePromptInput());

            expect(result.success).toBe(true);
            if (!result.success) return;

            expect(result.response.modelVersion).toBe('sonar-pro');
        });

        it('returns a timestamp as a Date instance', async () => {
            mockCreate.mockResolvedValueOnce(makePerplexityCompletion());

            const result = await adapter.execute(makePromptInput());

            expect(result.success).toBe(true);
            if (!result.success) return;

            expect(result.response.timestamp).toBeInstanceOf(Date);
        });

        it('calls recordSuccess after a successful API call', async () => {
            mockCreate.mockResolvedValueOnce(makePerplexityCompletion());
            const spy = vi.spyOn(adapter, 'recordSuccess');

            await adapter.execute(makePromptInput());

            expect(spy).toHaveBeenCalledOnce();
        });
    });

    // ── execute() — circuit breaker open ─────────────────────────────────────

    describe('execute() — circuit breaker open', () => {
        it('returns a failure result without calling the API when circuit is open', async () => {
            // Force the circuit open by injecting failures
            const error = new EngineError('fail', 'perplexity', 'api_error', true);
            for (let i = 0; i < 5; i++) {
                adapter.recordFailure(error);
            }
            expect(adapter.isCircuitOpen()).toBe(true);

            const result = await adapter.execute(makePromptInput());

            expect(result.success).toBe(false);
            expect(mockCreate).not.toHaveBeenCalled();
        });

        it('returns an EngineError when circuit is open', async () => {
            const error = new EngineError('fail', 'perplexity', 'api_error', true);
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
        it('throws EngineRateLimitError on HTTP 429', async () => {
            mockCreate.mockRejectedValueOnce(makeAPIError('Rate limit exceeded', 429));

            await expect(adapter.execute(makePromptInput())).rejects.toBeInstanceOf(
                EngineRateLimitError,
            );
        });

        it('throws EngineAuthError on HTTP 401', async () => {
            mockCreate.mockRejectedValueOnce(makeAPIError('Unauthorized', 401));

            await expect(adapter.execute(makePromptInput())).rejects.toBeInstanceOf(
                EngineAuthError,
            );
        });

        it('throws EngineAuthError on HTTP 403', async () => {
            mockCreate.mockRejectedValueOnce(makeAPIError('Forbidden', 403));

            await expect(adapter.execute(makePromptInput())).rejects.toBeInstanceOf(
                EngineAuthError,
            );
        });

        it('throws EngineTimeoutError when AbortController fires', async () => {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            mockCreate.mockRejectedValueOnce(abortError);

            await expect(adapter.execute(makePromptInput())).rejects.toBeInstanceOf(
                EngineTimeoutError,
            );
        });

        it('calls recordFailure on API errors', async () => {
            mockCreate.mockRejectedValueOnce(makeAPIError('Server error', 500));
            const spy = vi.spyOn(adapter, 'recordFailure');

            await expect(adapter.execute(makePromptInput())).rejects.toThrow();
            expect(spy).toHaveBeenCalledOnce();
        });
    });

    // ── parseResponse() ───────────────────────────────────────────────────────

    describe('parseResponse()', () => {
        it('extracts rawText from choices[0].message.content', () => {
            const completion = makePerplexityCompletion();
            const response = adapter.parseResponse({ completion, executionTimeMs: 150 });

            expect(response.rawText).toBe(
                'HubSpot is a leading CRM platform used by thousands of businesses.',
            );
        });

        it('normalizes citation URLs to base domains', () => {
            const completion = makePerplexityCompletion({
                citations: [
                    'https://www.hubspot.com/blog/crm',
                    'https://salesforce.com',
                    'https://www.g2.com/categories/crm',
                ],
            });
            const response = adapter.parseResponse({ completion, executionTimeMs: 100 });

            expect(response.citations[0].domain).toBe('hubspot.com');
            expect(response.citations[1].domain).toBe('salesforce.com');
            expect(response.citations[2].domain).toBe('g2.com');
        });

        it('strips www. prefix from citation domains', () => {
            const completion = makePerplexityCompletion({
                citations: ['https://www.example.com/some/path?q=1'],
            });
            const response = adapter.parseResponse({ completion, executionTimeMs: 100 });

            expect(response.citations[0].domain).toBe('example.com');
        });

        it('strips path from citation URLs, keeping only the domain', () => {
            const completion = makePerplexityCompletion({
                citations: ['https://hubspot.com/blog/crm/top-10-tools'],
            });
            const response = adapter.parseResponse({ completion, executionTimeMs: 100 });

            expect(response.citations[0].domain).toBe('hubspot.com');
        });

        it('preserves the original URL in the citation', () => {
            const url = 'https://www.hubspot.com/blog/crm';
            const completion = makePerplexityCompletion({ citations: [url] });
            const response = adapter.parseResponse({ completion, executionTimeMs: 100 });

            expect(response.citations[0].url).toBe(url);
        });

        it('classifies all citations as "other" (classification happens downstream)', () => {
            const completion = makePerplexityCompletion();
            const response = adapter.parseResponse({ completion, executionTimeMs: 100 });

            for (const citation of response.citations) {
                expect(citation.classification).toBe('other');
            }
        });

        it('handles missing citations gracefully — returns empty array', () => {
            const completion = makePerplexityCompletion({ citations: undefined });
            const response = adapter.parseResponse({ completion, executionTimeMs: 100 });

            expect(response.citations).toEqual([]);
        });

        it('handles empty citations array', () => {
            const completion = makePerplexityCompletion({ citations: [] });
            const response = adapter.parseResponse({ completion, executionTimeMs: 100 });

            expect(response.citations).toEqual([]);
        });

        it('extracts modelVersion from the model field', () => {
            const completion = makePerplexityCompletion({ model: 'sonar-pro' });
            const response = adapter.parseResponse({ completion, executionTimeMs: 100 });

            expect(response.modelVersion).toBe('sonar-pro');
        });

        it('returns a timestamp as a Date instance', () => {
            const completion = makePerplexityCompletion();
            const response = adapter.parseResponse({ completion, executionTimeMs: 100 });

            expect(response.timestamp).toBeInstanceOf(Date);
        });

        it('preserves executionTimeMs from the raw input', () => {
            const completion = makePerplexityCompletion();
            const response = adapter.parseResponse({ completion, executionTimeMs: 350 });

            expect(response.executionTimeMs).toBe(350);
        });

        it('includes citationCount in metadata', () => {
            const completion = makePerplexityCompletion();
            const response = adapter.parseResponse({ completion, executionTimeMs: 100 });

            expect(response.metadata.citationCount).toBe(3);
        });
    });

    // ── getCostPerCall() ──────────────────────────────────────────────────────

    describe('getCostPerCall()', () => {
        it('returns 0.005', () => {
            expect(adapter.getCostPerCall()).toBe(0.005);
        });
    });

    // ── getRateLimits() ───────────────────────────────────────────────────────

    describe('getRateLimits()', () => {
        it('returns requestsPerMinute of 50 (from CONFIG_DEFAULTS engines.perplexity_rpm)', () => {
            expect(adapter.getRateLimits().requestsPerMinute).toBe(50);
        });

        it('returns requestsPerDay of 5000', () => {
            expect(adapter.getRateLimits().requestsPerDay).toBe(5_000);
        });

        it('returns cooldownMs of 1200', () => {
            expect(adapter.getRateLimits().cooldownMs).toBe(1_200);
        });
    });

    // ── engineId / engineName ─────────────────────────────────────────────────

    describe('identity', () => {
        it('has engineId "perplexity"', () => {
            expect(adapter.engineId).toBe('perplexity');
        });

        it('has correct engineName', () => {
            expect(adapter.engineName).toBe('Perplexity (Sonar)');
        });
    });
});
