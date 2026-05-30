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
    const mentionPresence = extraction.brandMentioned ? 100 : 0;
    const position = positionFactor(extraction.mentionPosition);
    const recommendation = recommendationFactor(extraction.recommendationStrength);
    const citation = extraction.brandCited ? 100 : 0;

    const score =
        mentionPresence * weights.mention +
        position * weights.position +
        recommendation * weights.recommendation +
        citation * weights.citation;

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
    const mentionPresence = extraction.brandMentioned ? 100 : 0;
    const position = positionFactor(extraction.mentionPosition);
    const recommendation = recommendationFactor(extraction.recommendationStrength);
    const citation = extraction.brandCited ? 100 : 0;

    return {
        factors: {
            mention: { raw: mentionPresence, weighted: mentionPresence * weights.mention },
            position: { raw: position, weighted: position * weights.position },
            recommendation: { raw: recommendation, weighted: recommendation * weights.recommendation },
            citation: { raw: citation, weighted: citation * weights.citation },
        },
        total: computeVisibilityScore(extraction, weights),
    };
}
