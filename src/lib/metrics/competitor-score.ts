/**
 * Per-competitor visibility scoring for the Metric_Engine.
 *
 * Competitors are scored with the EXACT SAME formula as the monitored brand.
 * The extraction pipeline produces the same signals for every entity (was it
 * mentioned, at what position, with what recommendation strength, and was it
 * cited), so a competitor's visibility score is just `computeVisibilityScore`
 * applied to that competitor's signals. There is a single source of truth for
 * the formula — this module never reimplements it.
 *
 * Every function here is a PURE FUNCTION: identical inputs always produce
 * identical outputs and there are no side effects (no DB, no clock, no I/O).
 *
 * Validates: Requirement 6.5 (per-competitor Visibility_Score using the same
 *            formula applied to competitor mentions)
 * Validates: Requirement 17.3 (competitor appearances for gap analysis)
 * Validates: Requirement 17.5 (gap between competitor and brand scores feeds
 *            the ">20 points" recommendation trigger)
 */

import { computeVisibilityScore } from './visibility-score';
import type {
    ExtractionResult,
    ScoreWeights,
    MentionPosition,
    RecommendationStrength,
} from '@/types';

/**
 * Per-entity extraction signals within a single prompt-engine execution.
 *
 * These are the same four scoring inputs the brand has, captured for one
 * entity (a competitor) in one execution.
 */
export interface EntityExtractionSignals {
    /** Identifier of the entity (competitor) these signals belong to. */
    entityId: string;
    /** Whether the entity was mentioned in the response. */
    mentioned: boolean;
    /** Position of the first mention (first/middle/last third), or null. */
    position: MentionPosition;
    /** Recommendation-strength language associated with the mention. */
    recommendationStrength: RecommendationStrength;
    /** Whether the entity's URL was cited in the response. */
    cited: boolean;
}

/**
 * A competitor's signals for one prompt-engine execution.
 */
export interface CompetitorExecution {
    /** Identifier of the competitor scored in this execution. */
    competitorId: string;
    /** Extraction signals captured for this competitor. */
    signals: EntityExtractionSignals;
}

/**
 * Per-competitor visibility breakdown across one or more executions.
 */
export interface CompetitorScoreResult {
    competitorId: string;
    /** Average visibility score (0-100) across the competitor's executions. */
    visibilityScore: number;
    /** Number of executions in which the competitor was mentioned. */
    mentionCount: number;
    /** Total executions counted for this competitor. */
    executionCount: number;
}

/**
 * The gap between the brand's score and a competitor's score (Requirement 17.5).
 */
export interface CompetitorGap {
    competitorId: string;
    /** The competitor's visibility score (0-100). */
    competitorScore: number;
    /** The brand's visibility score (0-100) being compared against. */
    brandScore: number;
    /** competitorScore - brandScore (positive means the competitor is ahead). */
    gap: number;
    /** True when the competitor's score exceeds the brand's score. */
    competitorAhead: boolean;
}

/**
 * Convert per-entity extraction signals into the `ExtractionResult` shape that
 * `computeVisibilityScore` consumes. This is what lets a competitor be scored
 * with the identical brand formula: the competitor's signals are mapped onto
 * the same four scoring inputs (`brandMentioned`, `mentionPosition`,
 * `recommendationStrength`, `brandCited`).
 *
 * The non-scoring fields are filled with neutral defaults: `confidenceScore`
 * of 1 (signals are treated as resolved), `ambiguous` false, and no citations
 * — none of these affect `computeVisibilityScore`.
 */
export function signalsToExtraction(
    signals: EntityExtractionSignals
): ExtractionResult {
    return {
        brandMentioned: signals.mentioned,
        mentionPosition: signals.position,
        recommendationStrength: signals.recommendationStrength,
        brandCited: signals.cited,
        confidenceScore: 1,
        ambiguous: false,
        citations: [],
    };
}

/**
 * Compute a competitor's visibility score (0-100) for a single execution,
 * reusing the brand's `computeVisibilityScore` formula.
 *
 * Validates: Requirement 6.5
 */
export function competitorVisibilityScore(
    signals: EntityExtractionSignals,
    weights?: ScoreWeights
): number {
    const extraction = signalsToExtraction(signals);
    return weights === undefined
        ? computeVisibilityScore(extraction)
        : computeVisibilityScore(extraction, weights);
}

/**
 * Average a single competitor's per-execution visibility scores across every
 * execution belonging to that competitor. Executions for other competitors are
 * ignored. Returns 0 when the competitor has no executions, and rounds to the
 * nearest integer (matching the workspace aggregate convention).
 *
 * Validates: Requirement 6.5
 */
export function aggregateCompetitorScore(
    executions: CompetitorExecution[],
    competitorId: string,
    weights?: ScoreWeights
): number {
    const own = executions.filter((e) => e.competitorId === competitorId);
    if (own.length === 0) {
        return 0;
    }
    const total = own.reduce(
        (sum, e) => sum + competitorVisibilityScore(e.signals, weights),
        0
    );
    return Math.round(total / own.length);
}

/**
 * Group executions by competitor and produce a per-competitor breakdown:
 * average visibility score, mention count, and execution count. First-seen
 * competitor order is preserved so the output is deterministic for a given
 * input ordering. Returns an empty array for empty input.
 *
 * Validates: Requirements 6.5, 17.3
 */
export function computeAllCompetitorScores(
    executions: CompetitorExecution[],
    weights?: ScoreWeights
): CompetitorScoreResult[] {
    const groups = new Map<string, CompetitorExecution[]>();
    for (const execution of executions) {
        const existing = groups.get(execution.competitorId);
        if (existing) {
            existing.push(execution);
        } else {
            groups.set(execution.competitorId, [execution]);
        }
    }

    const results: CompetitorScoreResult[] = [];
    groups.forEach((group, competitorId) => {
        const mentionCount = group.reduce(
            (count, e) => count + (e.signals.mentioned ? 1 : 0),
            0
        );
        results.push({
            competitorId,
            visibilityScore: aggregateCompetitorScore(
                group,
                competitorId,
                weights
            ),
            mentionCount,
            executionCount: group.length,
        });
    });
    return results;
}

/**
 * Compute the gap between a brand's visibility score and each competitor's
 * score. A positive gap means the competitor is ahead of the brand; this value
 * feeds the Requirement 17.5 trigger that flags competitors exceeding the brand
 * by more than 20 points.
 *
 * Validates: Requirement 17.5
 */
export function computeCompetitorGaps(
    brandScore: number,
    competitorScores: CompetitorScoreResult[]
): CompetitorGap[] {
    return competitorScores.map((competitor) => {
        const gap = competitor.visibilityScore - brandScore;
        return {
            competitorId: competitor.competitorId,
            competitorScore: competitor.visibilityScore,
            brandScore,
            gap,
            competitorAhead: gap > 0,
        };
    });
}
