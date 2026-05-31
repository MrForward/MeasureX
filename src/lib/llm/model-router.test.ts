/**
 * Unit tests for the ModelRouter.
 *
 * Requirement 8.4: cost-efficient models for classification tasks.
 * Requirement 8.5: expensive models reserved for generation tasks.
 *
 * All tests inject a MOCK ModelCaller — no real API calls, no network, and no
 * time-dependent / flaky assertions. Token burn protection is verified: the
 * fallback chain is finite, cost is tracked per successful call, and a fully
 * failing chain throws AllModelsFailedError (never an infinite retry).
 */

import { describe, it, expect, vi } from 'vitest';
import { ModelRouter, AllModelsFailedError } from './model-router';
import { ModelTask, type ModelCaller, type ModelConfig } from './types';

/** A mock caller that always succeeds, echoing which model was used. */
function succeedingCaller(): ModelCaller & { call: ReturnType<typeof vi.fn> } {
    return {
        call: vi.fn(async (config: ModelConfig) => `ok:${config.model}`),
    };
}

/** A mock caller that fails for specific models and succeeds for the rest. */
function callerFailingFor(...failingModels: string[]): ModelCaller & {
    call: ReturnType<typeof vi.fn>;
} {
    return {
        call: vi.fn(async (config: ModelConfig) => {
            if (failingModels.includes(config.model)) {
                throw new Error(`provider error for ${config.model}`);
            }
            return `ok:${config.model}`;
        }),
    };
}

/** A mock caller that always throws (every model unavailable). */
function alwaysFailingCaller(): ModelCaller & { call: ReturnType<typeof vi.fn> } {
    return {
        call: vi.fn(async () => {
            throw new Error('provider down');
        }),
    };
}

describe('route', () => {
    it('returns the cheap primary (claude-3-5-haiku) for classification tasks', () => {
        const router = new ModelRouter(succeedingCaller());
        expect(router.route(ModelTask.ENTITY_CLASSIFICATION).model).toBe('claude-3-5-haiku');
        expect(router.route(ModelTask.CONTEXT_DISAMBIGUATION).model).toBe('claude-3-5-haiku');
        expect(router.route(ModelTask.RECOMMENDATION_STRENGTH).model).toBe('claude-3-5-haiku');
    });

    it('returns the quality primary (claude-3-5-sonnet) for generation tasks', () => {
        const router = new ModelRouter(succeedingCaller());
        expect(router.route(ModelTask.RECOMMENDATION_GENERATION).model).toBe('claude-3-5-sonnet');
        expect(router.route(ModelTask.PROMPT_SUGGESTION).model).toBe('claude-3-5-sonnet');
    });

    it('keeps classification cheap and generation more expensive (Req 8.4 / 8.5)', () => {
        const router = new ModelRouter(succeedingCaller());
        const classification = router.route(ModelTask.ENTITY_CLASSIFICATION);
        const generation = router.route(ModelTask.RECOMMENDATION_GENERATION);
        expect(classification.costPerCall).toBeLessThan(generation.costPerCall);
    });
});

describe('getFallbackChain', () => {
    it('returns the primary first, then the fallback(s)', () => {
        const router = new ModelRouter(succeedingCaller());
        const chain = router.getFallbackChain(ModelTask.ENTITY_CLASSIFICATION);
        expect(chain.map((c) => c.model)).toEqual(['claude-3-5-haiku', 'gpt-3.5-turbo']);
    });

    it('falls back generation Sonnet → gpt-4o-mini, never gpt-4o (Cost Rule #5)', () => {
        const router = new ModelRouter(succeedingCaller());
        const genChain = router.getFallbackChain(ModelTask.RECOMMENDATION_GENERATION);
        const suggestChain = router.getFallbackChain(ModelTask.PROMPT_SUGGESTION);

        expect(genChain.map((c) => c.model)).toEqual(['claude-3-5-sonnet', 'gpt-4o-mini']);
        expect(suggestChain.map((c) => c.model)).toEqual(['claude-3-5-sonnet', 'gpt-4o-mini']);

        // Explicitly: no chain may degrade to the expensive gpt-4o.
        expect(genChain.some((c) => c.model === 'gpt-4o')).toBe(false);
        expect(suggestChain.some((c) => c.model === 'gpt-4o')).toBe(false);
    });

    it('returns copies so callers cannot mutate the shared definitions', () => {
        const router = new ModelRouter(succeedingCaller());
        const first = router.getFallbackChain(ModelTask.ENTITY_CLASSIFICATION);
        first[0].costPerCall = 999;
        const second = router.getFallbackChain(ModelTask.ENTITY_CLASSIFICATION);
        expect(second[0].costPerCall).not.toBe(999);
    });
});

describe('execute', () => {
    it('returns the primary result on success and only calls once', async () => {
        const caller = succeedingCaller();
        const router = new ModelRouter(caller);
        const out = await router.execute(ModelTask.ENTITY_CLASSIFICATION, 'prompt');

        expect(out.result).toBe('ok:claude-3-5-haiku');
        expect(out.modelUsed).toBe('claude-3-5-haiku');
        expect(out.costIncurred).toBeCloseTo(0.0003);
        expect(caller.call).toHaveBeenCalledTimes(1);
    });

    it('falls back to the secondary model when the primary throws', async () => {
        const caller = callerFailingFor('claude-3-5-haiku');
        const router = new ModelRouter(caller);
        const out = await router.execute(ModelTask.ENTITY_CLASSIFICATION, 'prompt');

        expect(out.result).toBe('ok:gpt-3.5-turbo');
        expect(out.modelUsed).toBe('gpt-3.5-turbo');
        // Primary attempted, then fallback — exactly two calls (finite chain).
        expect(caller.call).toHaveBeenCalledTimes(2);
    });

    it('throws AllModelsFailedError when every model in the chain fails', async () => {
        const caller = alwaysFailingCaller();
        const router = new ModelRouter(caller);

        await expect(router.execute(ModelTask.ENTITY_CLASSIFICATION, 'prompt')).rejects.toBeInstanceOf(
            AllModelsFailedError,
        );
        // Walked the finite chain exactly once (no infinite retry).
        expect(caller.call).toHaveBeenCalledTimes(2);
    });

    it('AllModelsFailedError carries the task and the underlying errors', async () => {
        const router = new ModelRouter(alwaysFailingCaller());
        try {
            await router.execute(ModelTask.RECOMMENDATION_GENERATION, 'prompt');
            expect.unreachable('execute should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(AllModelsFailedError);
            const e = err as AllModelsFailedError;
            expect(e.task).toBe(ModelTask.RECOMMENDATION_GENERATION);
            expect(e.errors).toHaveLength(2);
        }
    });

    it('enforces a per-call timeout and falls back when the primary hangs', async () => {
        // Primary never resolves; fallback resolves immediately. With a tiny
        // timeout the router must abandon the primary and use the fallback.
        const caller: ModelCaller = {
            call: vi.fn((config: ModelConfig) => {
                if (config.model === 'claude-3-5-haiku') {
                    return new Promise<string>(() => {
                        /* never resolves */
                    });
                }
                return Promise.resolve(`ok:${config.model}`);
            }),
        };
        const router = new ModelRouter(caller, { timeoutMs: 10 });
        const out = await router.execute(ModelTask.ENTITY_CLASSIFICATION, 'prompt');

        expect(out.modelUsed).toBe('gpt-3.5-turbo');
    });
});

describe('cost tracking', () => {
    it('accumulates cost across successful calls', async () => {
        const router = new ModelRouter(succeedingCaller());
        expect(router.getTotalCost()).toBe(0);

        await router.execute(ModelTask.ENTITY_CLASSIFICATION, 'a'); // +0.0003
        await router.execute(ModelTask.RECOMMENDATION_GENERATION, 'b'); // +0.01

        expect(router.getTotalCost()).toBeCloseTo(0.0103);
    });

    it('only charges the model that actually succeeded after a fallback', async () => {
        // Primary haiku (0.0003) fails → fallback gpt-3.5-turbo (0.0005) succeeds.
        const router = new ModelRouter(callerFailingFor('claude-3-5-haiku'));
        await router.execute(ModelTask.ENTITY_CLASSIFICATION, 'prompt');
        expect(router.getTotalCost()).toBeCloseTo(0.0005);
    });

    it('does not charge anything when the whole chain fails', async () => {
        const router = new ModelRouter(alwaysFailingCaller());
        await expect(
            router.execute(ModelTask.ENTITY_CLASSIFICATION, 'prompt'),
        ).rejects.toBeInstanceOf(AllModelsFailedError);
        expect(router.getTotalCost()).toBe(0);
    });

    it('resetCost() resets the cumulative total to 0', async () => {
        const router = new ModelRouter(succeedingCaller());
        await router.execute(ModelTask.RECOMMENDATION_GENERATION, 'b');
        expect(router.getTotalCost()).toBeGreaterThan(0);

        router.resetCost();
        expect(router.getTotalCost()).toBe(0);
    });
});
