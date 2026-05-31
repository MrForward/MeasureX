/**
 * Unit tests for the router-backed LLMClassifier bridge.
 *
 * Requirement 8.4: cost-efficient models for classification tasks.
 *
 * Tests inject a MOCK ModelCaller via a real ModelRouter — no network, no real
 * API calls, no flaky/time-dependent assertions. They verify the adapter
 * delegates to router.execute() with the correct task and returns the result
 * string unchanged.
 */

import { describe, it, expect, vi } from 'vitest';
import { createClassifier } from './classifier';
import { ModelRouter } from './model-router';
import { ModelTask, type ModelCaller, type ModelConfig } from './types';

/** A mock caller that echoes which model handled the prompt. */
function echoCaller(): ModelCaller & { call: ReturnType<typeof vi.fn> } {
    return {
        call: vi.fn(async (config: ModelConfig, prompt: string) => `reply(${config.model}):${prompt}`),
    };
}

describe('createClassifier', () => {
    it('returns an object exposing a classify() method', () => {
        const router = new ModelRouter(echoCaller());
        const classifier = createClassifier(router, ModelTask.RECOMMENDATION_STRENGTH);
        expect(typeof classifier.classify).toBe('function');
    });

    it('classify() delegates to the router using the bound task', async () => {
        const caller = echoCaller();
        const router = new ModelRouter(caller);
        const classifier = createClassifier(router, ModelTask.RECOMMENDATION_STRENGTH);

        await classifier.classify('is this a recommendation?');

        // RECOMMENDATION_STRENGTH routes to the cheap haiku primary.
        expect(caller.call).toHaveBeenCalledTimes(1);
        const [configArg] = caller.call.mock.calls[0];
        expect((configArg as ModelConfig).model).toBe('claude-3-5-haiku');
    });

    it('classify() returns the router result string', async () => {
        const router = new ModelRouter(echoCaller());
        const classifier = createClassifier(router, ModelTask.ENTITY_CLASSIFICATION);

        const out = await classifier.classify('classify me');
        expect(out).toBe('reply(claude-3-5-haiku):classify me');
    });

    it('binds different tasks to different primary models', async () => {
        const caller = echoCaller();
        const router = new ModelRouter(caller);

        const strength = createClassifier(router, ModelTask.RECOMMENDATION_STRENGTH);
        const generation = createClassifier(router, ModelTask.RECOMMENDATION_GENERATION);

        await strength.classify('a');
        await generation.classify('b');

        expect((caller.call.mock.calls[0][0] as ModelConfig).model).toBe('claude-3-5-haiku');
        expect((caller.call.mock.calls[1][0] as ModelConfig).model).toBe('claude-3-5-sonnet');
    });

    it('tracks cost on the router as classification calls run', async () => {
        const router = new ModelRouter(echoCaller());
        const classifier = createClassifier(router, ModelTask.RECOMMENDATION_STRENGTH);

        await classifier.classify('a');
        expect(router.getTotalCost()).toBeCloseTo(0.0003);
    });
});
