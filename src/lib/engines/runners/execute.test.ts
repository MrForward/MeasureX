/**
 * Unit tests for executeEngineRun — mapping a caller's outcome into the
 * persist-ready EngineRunResult (PRD §F4 "Store per run").
 */

import { describe, it, expect } from 'vitest';
import { executeEngineRun } from './execute';

const immediate = { retry: { sleep: async () => {} } };

describe('executeEngineRun', () => {
    it('maps a successful completion into a completed result', async () => {
        const result = await executeEngineRun(
            'perplexity',
            'sonar',
            async () => ({
                content: 'hello world',
                citations: ['https://g2.com/x'],
                tokensUsed: 42,
                model: 'sonar-pro',
            }),
            immediate,
        );
        expect(result).toEqual({
            engine: 'perplexity',
            model: 'sonar-pro',
            status: 'completed',
            rawResponse: 'hello world',
            nativeCitations: ['https://g2.com/x'],
            tokensUsed: 42,
            errorMessage: null,
        });
    });

    it('defaults citations to [] and tokens to null, falling back to the passed model', async () => {
        const result = await executeEngineRun(
            'chatgpt',
            'gpt-4o-mini',
            async () => ({ content: 'hi' }),
            immediate,
        );
        expect(result.nativeCitations).toEqual([]);
        expect(result.tokensUsed).toBeNull();
        expect(result.model).toBe('gpt-4o-mini');
        expect(result.status).toBe('completed');
    });

    it('never throws — a failing caller becomes a failed result', async () => {
        const result = await executeEngineRun(
            'chatgpt',
            'gpt-4o-mini',
            async () => {
                // Raw provider error containing a secret — must NOT leak.
                const e = new Error('Incorrect API key provided: sk-abc123') as Error & { status?: number };
                e.status = 401;
                throw e;
            },
            immediate,
        );
        expect(result.status).toBe('failed');
        expect(result.rawResponse).toBeNull();
        expect(result.nativeCitations).toBeNull();
        expect(result.tokensUsed).toBeNull();
        // Genericized — no raw provider detail / secret leaks through.
        expect(result.errorMessage).toBe('Engine authentication failed.');
        expect(result.errorMessage).not.toContain('sk-');
    });

    it('genericizes other provider errors (no raw detail leaks)', async () => {
        const make = (status: number) => async () => {
            const e = new Error(`internal detail org_xyz status ${status}`) as Error & { status?: number };
            e.status = status;
            throw e;
        };
        const rate = await executeEngineRun('chatgpt', 'gpt-4o-mini', make(429), immediate);
        const server = await executeEngineRun('chatgpt', 'gpt-4o-mini', make(500), immediate);
        expect(rate.errorMessage).toBe('The engine is rate limited. Please try again later.');
        expect(server.errorMessage).toBe('The engine returned a server error.');
        expect((rate.errorMessage ?? '') + (server.errorMessage ?? '')).not.toContain('org_xyz');
    });
});
