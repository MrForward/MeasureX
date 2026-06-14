/**
 * Per-competitor visibility scoring (PRD §F6 / §F7 competitor comparison).
 *
 * A competitor is scored with the EXACT SAME formula as the monitored brand:
 * each prompt-engine yields a 0-4 score, and the overall competitor score is
 * `(sum / (count × 4)) × 100`. The formula lives in one place
 * ({@link scorePromptEngine} / {@link computeOverallScore}) so brand and
 * competitor scores can never diverge.
 *
 * Pure and deterministic — no DB, no clock, no I/O.
 */

import {
    scorePromptEngine,
    computeOverallScore,
    type PromptScoreSignals,
} from './visibility-score';

/**
 * One competitor's signals within a single prompt-engine execution. Mirrors
 * {@link PromptScoreSignals}, but `beforeAllOthers` means this competitor
 * appears before every OTHER tracked entity (the brand and the other
 * competitors) — the competitor's analogue of the brand's "before all
 * competitors" bonus.
 */
export interface CompetitorPromptSignals {
    mentioned: boolean;
    cited: boolean;
    recommended: boolean;
    beforeAllOthers: boolean;
}

/** Score a single competitor prompt-engine combination (0-4). */
export function scoreCompetitorPromptEngine(
    signals: CompetitorPromptSignals,
): number {
    const mapped: PromptScoreSignals = {
        mentioned: signals.mentioned,
        cited: signals.cited,
        recommended: signals.recommended,
        beforeAllCompetitors: signals.beforeAllOthers,
    };
    return scorePromptEngine(mapped);
}

/**
 * Compute a competitor's overall visibility score (0-100) from its prompt-engine
 * signals — the same formula applied to the brand.
 */
export function computeCompetitorScore(
    signals: CompetitorPromptSignals[],
): number {
    const scores = signals.map(scoreCompetitorPromptEngine);
    return computeOverallScore(scores);
}

/**
 * Count the prompt-engine combinations where the competitor was mentioned but
 * the brand was not — the "appears on X prompts where you don't" gap shown on
 * the competitor comparison card (PRD §F7).
 *
 * Both arrays are indexed by the same prompt-engine combination.
 */
export function countCompetitorGaps(
    competitorMentioned: boolean[],
    brandMentioned: boolean[],
): number {
    const length = Math.min(competitorMentioned.length, brandMentioned.length);
    let gaps = 0;
    for (let i = 0; i < length; i += 1) {
        if (competitorMentioned[i] && !brandMentioned[i]) {
            gaps += 1;
        }
    }
    return gaps;
}
