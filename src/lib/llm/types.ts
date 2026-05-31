/**
 * Shared types for the centralized LLM model router.
 *
 * The router decides WHICH model handles WHICH task (see the design doc's
 * "Model & Agent Integration Instructions"). Task → model mappings follow the
 * platform's cost-optimization rules: cheap models (Haiku / GPT-3.5) for
 * classification, expensive models (Sonnet / GPT-4o) only for generation, and
 * fallback chains that degrade cheap → cheap (never cheap → expensive).
 *
 * Validates: Requirement 8.4 (use cost-efficient models for classification)
 * Validates: Requirement 8.5 (reserve expensive models for generation tasks)
 */

/** The distinct LLM-backed tasks the platform performs. */
export enum ModelTask {
    ENTITY_CLASSIFICATION = 'entity_classification',
    CONTEXT_DISAMBIGUATION = 'context_disambiguation',
    RECOMMENDATION_GENERATION = 'recommendation_generation',
    PROMPT_SUGGESTION = 'prompt_suggestion',
    RECOMMENDATION_STRENGTH = 'recommendation_strength',
}

/** A concrete model selection: provider, model id, and tuning + cost metadata. */
export interface ModelConfig {
    provider: 'openai' | 'anthropic';
    model: string;
    maxTokens: number;
    temperature: number;
    /** Estimated USD cost per call — used for cost tracking and budget caps. */
    costPerCall: number;
}

/**
 * Abstraction over an actual model-provider call. The real implementation wraps
 * the OpenAI / Anthropic SDKs; tests inject a mock so no network calls occur.
 *
 * Keeping this narrow and injectable is what lets the router (and its tests)
 * stay free of provider SDK coupling and real API usage.
 */
export interface ModelCaller {
    /** Call the given model with a prompt and resolve with its raw text reply. */
    call(config: ModelConfig, prompt: string): Promise<string>;
}
