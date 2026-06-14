/**
 * Visibility scoring engine (PRD §F6).
 *
 * Two-level scoring, all pure and deterministic:
 *
 *   1. Per prompt-engine score (0-4):
 *        absent → 0, mentioned → 1, cited → 2, recommended → 3,
 *        +1 bonus when the brand appears before ALL tracked competitors.
 *      Base points are NOT cumulative — take the highest applicable base and add
 *      the bonus. Max per prompt-engine = 4.
 *
 *   2. Overall visibility score (0-100):
 *        (sum of all prompt-engine scores) / (num_prompts × num_engines × 4) × 100
 *      rounded to the nearest integer.
 *
 * The orchestrator (`runExtraction`) already computes the per-prompt-engine
 * score and stores it as `Extraction.promptScore`; {@link scorePromptEngine} is
 * the single source of truth for that formula, re-exported here so scoring and
 * extraction can never drift apart.
 */

/** The four signals that determine a single prompt-engine score (PRD §F6). */
export interface PromptScoreSignals {
    /** Brand detected in the response. */
    mentioned: boolean;
    /** Brand's own domain appears in the citations. */
    cited: boolean;
    /** Recommendation strength is RECOMMENDED. */
    recommended: boolean;
    /** Brand appears before ALL tracked competitors. */
    beforeAllCompetitors: boolean;
}

/** Maximum score for a single prompt-engine combination. */
export const MAX_PROMPT_ENGINE_SCORE = 4;

/**
 * Score a single prompt-engine combination (0-4) per PRD §F6.
 *
 * Highest applicable base (recommended 3 > cited 2 > mentioned 1 > absent 0)
 * plus a +1 bonus when the brand is mentioned and precedes every competitor.
 */
export function scorePromptEngine(signals: PromptScoreSignals): number {
    if (!signals.mentioned) {
        return 0;
    }

    let base: number;
    if (signals.recommended) {
        base = 3;
    } else if (signals.cited) {
        base = 2;
    } else {
        base = 1;
    }

    const bonus = signals.beforeAllCompetitors ? 1 : 0;
    return Math.min(MAX_PROMPT_ENGINE_SCORE, base + bonus);
}

/**
 * Compute the overall visibility score (0-100) from every prompt-engine score
 * in a scan (PRD §F6).
 *
 * The denominator is the theoretical maximum — one perfect score (4) for every
 * prompt-engine combination. Returns 0 for an empty scan (no scores → no
 * visibility, and a guard against division by zero).
 */
export function computeOverallScore(promptScores: number[]): number {
    if (promptScores.length === 0) {
        return 0;
    }

    const sum = promptScores.reduce((total, score) => total + score, 0);
    const max = promptScores.length * MAX_PROMPT_ENGINE_SCORE;

    return Math.round((sum / max) * 100);
}

/**
 * Compute a per-engine visibility score (0-100) for each engine, suitable for
 * the `Scan.engineScores` JSON field (e.g. `{ chatgpt: 80, perplexity: 60 }`).
 *
 * `scoresByEngine` maps an engine id to that engine's prompt scores.
 */
export function computePerEngineScores(
    scoresByEngine: Record<string, number[]>,
): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [engine, scores] of Object.entries(scoresByEngine)) {
        out[engine] = computeOverallScore(scores);
    }
    return out;
}
