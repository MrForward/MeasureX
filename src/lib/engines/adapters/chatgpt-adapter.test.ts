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
import { ChatGPTAdapter } from './chatgpt-adapter';
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

function makeOpenAICompletion(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        id: 'chatcmpl-abc123',
        object: 'chat.completion',
        created: 1700000000,
        model: 'gpt-4o-mini-2024-07-18',
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content: 'HubSpot is a leading CRM platform.',
                },
                finish_reason: 'stop',
            },
        ],
        usage: {
            prompt_tokens: 25,
            completion_tokens: 10,
            total_tokens: 35,
        },
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

describe('ChatGPTAdapter', () => {
    let adapter: ChatGPTAdapter;

    beforeEach(() => {
        mockCreate.mockReset();
        adapter = new ChatGPTAdapter();
    });

    afterEach(() => {
        // Use clearAllMocks (not restoreAllMocks) to preserve mock implementations
        vi.clearAllMocks();
    });

    // ── execute() — success path ──────────────────────────────────────────────

    describe('execute() — success', () => {
        it('returns a success result with a StandardizedResponse', async () => {
            mockCreate.mockResolvedValueOnce(makeOpenAICompletion());

            const result = await adapter.execute(makePromptInput());

            expect(result.success).toBe(true);
            if (!result.success) return; // type narrowing

            expect(result.response.rawText).toBe('HubSpot is a leading CRM platform.');
            expect(result.response.citations).toEqual([]);
            expect(result.response.modelVersion).toBe('gpt-4o-mini-2024-07-18');
            expect(result.response.timestamp).toBeInstanceOf(Date);
            expect(typeof result.response.executionTimeMs).toBe('number');
        });

        it('includes token usage in the response when the API returns it', async () => {
            mockCreate.mockResolvedValueOnce(makeOpenAICompletion());

            const result = await adapter.execute(makePromptInput());

            expect(result.success).toBe(true);
            if (!result.success) return;

            expect(result.response.tokenUsage).toEqual({
                promptTokens: 25,
                completionTokens: 10,
            });
        });

        it('calls recordSuccess after a successful API call', async () => {
            mockCreate.mockResolvedValueOnce(makeOpenAICompletion());
            const spy = vi.spyOn(adapter, 'recordSuccess');

            await adapter.execute(makePromptInput());

            expect(spy).toHaveBeenCalledOnce();
        });
    });

    // ── execute() — circuit breaker open ─────────────────────────────────────

    describe('execute() — circuit breaker open', () => {
        it('returns a failure result without calling the API when circuit is open', async () => {
            // Force the circuit open by injecting failures
            const error = new EngineError('fail', 'chatgpt', 'api_error', true);
            for (let i = 0; i < 5; i++) {
                adapter.recordFailure(error);
            }
            expect(adapter.isCircuitOpen()).toBe(true);

            const result = await adapter.execute(makePromptInput());

            expect(result.success).toBe(false);
            expect(mockCreate).not.toHaveBeenCalled();
        });

        it('returns an EngineError when circuit is open', async () => {
            const error = new EngineError('fail', 'chatgpt', 'api_error', true);
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
            const completion = makeOpenAICompletion();
            const response = adapter.parseResponse({ completion, executionTimeMs: 150 });

            expect(response.rawText).toBe('HubSpot is a leading CRM platform.');
        });

        it('extracts modelVersion from the model field', () => {
            const completion = makeOpenAICompletion({ model: 'gpt-4o-mini-2024-07-18' });
            const response = adapter.parseResponse({ completion, executionTimeMs: 100 });

            expect(response.modelVersion).toBe('gpt-4o-mini-2024-07-18');
        });

        it('always returns an empty citations array', () => {
            const completion = makeOpenAICompletion();
            const response = adapter.parseResponse({ completion, executionTimeMs: 100 });

            expect(response.citations).toEqual([]);
        });

        it('extracts token usage from the usage field', () => {
            const completion = makeOpenAICompletion();
            const response = adapter.parseResponse({ completion, executionTimeMs: 100 });

            expect(response.tokenUsage).toEqual({
                promptTokens: 25,
                completionTokens: 10,
            });
        });

        it('returns undefined tokenUsage when usage is absent', () => {
            const completion = makeOpenAICompletion({ usage: undefined });
            const response = adapter.parseResponse({ completion, executionTimeMs: 100 });

            expect(response.tokenUsage).toBeUndefined();
        });

        it('returns a timestamp as a Date instance', () => {
            const completion = makeOpenAICompletion();
            const response = adapter.parseResponse({ completion, executionTimeMs: 100 });

            expect(response.timestamp).toBeInstanceOf(Date);
        });

        it('preserves executionTimeMs from the raw input', () => {
            const completion = makeOpenAICompletion();
            const response = adapter.parseResponse({ completion, executionTimeMs: 250 });

            expect(response.executionTimeMs).toBe(250);
        });
    });

    // ── getCostPerCall() ──────────────────────────────────────────────────────

    describe('getCostPerCall()', () => {
        it('returns 0.0015', () => {
            expect(adapter.getCostPerCall()).toBe(0.0015);
        });
    });

    // ── getRateLimits() ───────────────────────────────────────────────────────

    describe('getRateLimits()', () => {
        it('returns requestsPerMinute of 60 (from CONFIG_DEFAULTS)', () => {
            expect(adapter.getRateLimits().requestsPerMinute).toBe(60);
        });

        it('returns requestsPerDay of 10000', () => {
            expect(adapter.getRateLimits().requestsPerDay).toBe(10_000);
        });

        it('returns cooldownMs of 1000', () => {
            expect(adapter.getRateLimits().cooldownMs).toBe(1_000);
        });
    });

    // ── engineId / engineName ─────────────────────────────────────────────────

    describe('identity', () => {
        it('has engineId "chatgpt"', () => {
            expect(adapter.engineId).toBe('chatgpt');
        });

        it('has correct engineName', () => {
            expect(adapter.engineName).toBe('ChatGPT (gpt-4o-mini)');
        });
    });
});
