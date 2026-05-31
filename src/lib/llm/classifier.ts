/**
 * Bridge between the ModelRouter and the extraction modules.
 *
 * The extraction pipeline (recommendation-strength detection, context
 * disambiguation) depends only on the narrow, injectable `LLMClassifier`
 * interface — `classify(prompt): Promise<string>`. This module wires that
 * interface to the centralized ModelRouter so extraction code stays unaware of
 * which concrete model/provider runs, and benefits from the router's fallback
 * chains, per-call timeout, and cost tracking.
 *
 * Reusing the existing `LLMClassifier` interface (rather than redefining it)
 * keeps a single source of truth for the extraction ⇄ LLM contract.
 *
 * Validates: Requirement 8.4 (cost-efficient models for classification)
 */

import type { LLMClassifier } from '@/lib/extraction/recommendation-strength';
import type { ModelRouter } from './model-router';
import type { ModelTask } from './types';

/**
 * Create an `LLMClassifier` for a given task, backed by the router.
 *
 * The returned `classify(prompt)` delegates straight to `router.execute(task,
 * prompt)` and returns the model's text reply. All model selection, fallback,
 * timeout, and cost-tracking concerns live in the router — this is a thin,
 * task-bound adapter.
 *
 * Note: `execute` may throw `AllModelsFailedError` if every model in the
 * task's chain fails. Callers in extraction already treat a throwing classifier
 * as a safe-default case (they never let it crash extraction), so this adapter
 * intentionally does NOT swallow the error here — propagating it keeps cost and
 * failure semantics honest at the router boundary.
 */
export function createClassifier(router: ModelRouter, task: ModelTask): LLMClassifier {
    return {
        async classify(prompt: string): Promise<string> {
            const { result } = await router.execute(task, prompt);
            return result;
        },
    };
}
