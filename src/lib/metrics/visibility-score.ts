import { config } from '@/lib/config';
import type {
    ExtractionResult,
    MentionPosition,
    RecommendationStrength,
    ScoreWeights,
} from '@/types';

/**
 * Default equal weights (25% each). Can be overridden via platform config.
 */
export const DEFAULT_WEIGHTS: ScoreWeights = {
    mention: 0.25,
    position: 0.25,
    recommendation: 0.25,
    citation: 0.25,
};

/**
 * Normalize weights so they sum to 1.0.
 *
 * This is a defensive guard: platform config is runtime-editable, so a bad
 * configuration (e.g. weights summing to 2.0, or all zero) must never be able
 * to push a visibility score outside the [0, 100] range. Normalizing first
 * guarantees the weighted sum of four factors (each 0-100) stays in [0, 100].
 *
 * - If the weights sum to 0 (or are negative), fall back to equal weights.
 * - Otherwise divide each weight by the total so they sum to 1.0.
 */
export function normalizeWeights(weights: ScoreWeights): ScoreWeights {
    const total =
        weights.mention +
        weights.position +
        weights.recommendation +
        weights.citation;

    if (total <= 0) {
        return { ...DEFAULT_WEIGHTS };
    }

    return {
        mention: weights.mention / total,
        position: weights.position / total,
        recommendation: weights.recommendation / total,
        citation: weights.citation / total,
    };
}

/**
 * Load the four scoring weights from the platform config system, falling back
 * to the equal 25% defaults when a key is missing or the DB is unavailable.
 *
 * "Config over code" — the relative importance of each factor is tunable at
 * runtime via the admin panel without a redeploy (see Requirement 6.1 and the
 * V1.1 "custom score weights" roadmap item).
 */
export async function loadScoreWeights(): Promise<ScoreWeights> {
    const [mention, position, recommendation, citation] = await Promise.all([
        config.get<number>('scoring.mention_weight', DEFAULT_WEIGHTS.mention),
        config.get<number>('scoring.position_weight', DEFAULT_WEIGHTS.position),
        config.get<number>(
            'scoring.recommendation_weight',
            DEFAULT_WEIGHTS.recommendation
        ),
        config.get<number>('scoring.citation_weight', DEFAULT_WEIGHTS.citation),
    ]);

    return { mention, position, recommendation, citation };
}

/**
 * Score for the mention-position factor.
 */
function positionFactor(position: MentionPosition): number {
    switch (position) {
        case 'first':
            return 100;
        case 'middle':
            return 66;
        case 'last':
            return 33;
        default:
            return 0;
    }
}

/**
 * Score for the recommendation-strength factor.
 */
function recommendationFactor(strength: RecommendationStrength): number {
    switch (strength) {
        case 'explicit':
            return 100;
        case 'neutral':
            return 50;
        default:
            return 0;
    }
}

/**
 * Compute the visibility score (0-100) for a single extraction result.
 *
 * This is a PURE FUNCTION — identical inputs always produce identical outputs.
 * Four factors, each weighted (default 25%):
 *   1. Mention presence  (binary)
 *   2. Mention position  (first/middle/last)
 *   3. Recommendation strength (explicit/neutral/none)
 *   4. Citation inclusion (binary)
 *
 * Validates: Requirements 6.1, Property 1 (bounds), Property 2 (determinism)
 */
export function computeVisibilityScore(
    extraction: ExtractionResult,
    weights: ScoreWeights = DEFAULT_WEIGHTS
): number {
    // Normalize defensively so a misconfigured weight set (summing to anything
    // other than 1.0, or all zero) can never produce a score outside [0, 100].
    const w = normalizeWeights(weights);

    const mentionPresence = extraction.brandMentioned ? 100 : 0;
    const position = positionFactor(extraction.mentionPosition);
    const recommendation = recommendationFactor(extraction.recommendationStrength);
    const citation = extraction.brandCited ? 100 : 0;

    const score =
        mentionPresence * w.mention +
        position * w.position +
        recommendation * w.recommendation +
        citation * w.citation;

    // Clamp to [0, 100] for safety, then round.
    return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Breakdown of how each factor contributed to the final score.
 * Used by the "score breakdown" dashboard view (Requirement 19.4).
 */
export function getScoreBreakdown(
    extraction: ExtractionResult,
    weights: ScoreWeights = DEFAULT_WEIGHTS
) {
    const w = normalizeWeights(weights);

    const mentionPresence = extraction.brandMentioned ? 100 : 0;
    const position = positionFactor(extraction.mentionPosition);
    const recommendation = recommendationFactor(extraction.recommendationStrength);
    const citation = extraction.brandCited ? 100 : 0;

    return {
        factors: {
            mention: { raw: mentionPresence, weighted: mentionPresence * w.mention },
            position: { raw: position, weighted: position * w.position },
            recommendation: { raw: recommendation, weighted: recommendation * w.recommendation },
            citation: { raw: citation, weighted: citation * w.citation },
        },
        total: computeVisibilityScore(extraction, weights),
    };
}
