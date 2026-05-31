/**
 * Ambiguity flagging — marks low-confidence entity matches for human review.
 *
 * Downstream consumer of the confidence-scoring module (see `confidence.ts`).
 * After the extractor assigns each {@link EntityMatch} a confidence in the range
 * 0-1, this module flags the matches whose confidence falls below the configured
 * ambiguity threshold so they can be surfaced in the ambiguous-mention review UI
 * (task 5.16) rather than silently feeding the metrics pipeline.
 *
 * The threshold defaults to the platform config value
 * `extraction.confidence_threshold` (0.7). A match is ambiguous when its
 * confidence is STRICTLY below the threshold, so a match sitting exactly on the
 * boundary (0.7) is treated as confident. Concretely:
 *   - exact match (confidence 1.0)      → never ambiguous;
 *   - fuzzy distance 1 (confidence 0.825) → not ambiguous (0.825 >= 0.7);
 *   - fuzzy distance 2 (confidence 0.65)  → ambiguous (0.65 < 0.7).
 *
 * Every function is pure and deterministic (no I/O, no global state). The
 * threshold is read once from CONFIG_DEFAULTS at module load; callers that need
 * a per-workspace override can pass an explicit `threshold` argument.
 *
 * Validates: Requirement 5.7 (flag mentions with confidence below the
 * confidence threshold as ambiguous for manual review)
 */

import { CONFIG_DEFAULTS } from '@/lib/config/defaults';
import type { EntityMatch } from './types';

/**
 * Default ambiguity threshold, sourced from the platform config registry key
 * `extraction.confidence_threshold` (0.7). Matches below this value are flagged
 * as ambiguous. Kept tunable via the admin panel / per-call override rather than
 * hardcoded inline (config-over-code principle).
 */
export const AMBIGUITY_THRESHOLD = CONFIG_DEFAULTS['extraction.confidence_threshold'].value as number;

/**
 * An {@link EntityMatch} annotated with whether it is ambiguous (i.e. its
 * confidence fell below the ambiguity threshold and it needs human review).
 */
export interface FlaggedMatch extends EntityMatch {
    /** True when the match's confidence is strictly below the threshold. */
    ambiguous: boolean;
}

/**
 * Whether a match is ambiguous: true when its confidence is STRICTLY below the
 * threshold. A match exactly on the boundary is considered confident.
 *
 * @param match     the match to evaluate.
 * @param threshold optional override; defaults to {@link AMBIGUITY_THRESHOLD}.
 */
export function isAmbiguous(match: EntityMatch, threshold: number = AMBIGUITY_THRESHOLD): boolean {
    return match.confidence < threshold;
}

/**
 * Return a copy of the match with an `ambiguous` flag attached.
 *
 * @param match     the match to flag.
 * @param threshold optional override; defaults to {@link AMBIGUITY_THRESHOLD}.
 */
export function flagAmbiguity(match: EntityMatch, threshold: number = AMBIGUITY_THRESHOLD): FlaggedMatch {
    return { ...match, ambiguous: isAmbiguous(match, threshold) };
}

/**
 * Flag every match in an array, preserving order. Returns a new array of
 * {@link FlaggedMatch}; the input array is not mutated.
 *
 * @param matches   the matches to flag.
 * @param threshold optional override; defaults to {@link AMBIGUITY_THRESHOLD}.
 */
export function flagAmbiguousMatches(
    matches: EntityMatch[],
    threshold: number = AMBIGUITY_THRESHOLD,
): FlaggedMatch[] {
    return matches.map((match) => flagAmbiguity(match, threshold));
}

/**
 * Count how many matches are ambiguous — used for run-level reporting (e.g.
 * "12 mentions need review").
 *
 * @param matches   the matches to inspect.
 * @param threshold optional override; defaults to {@link AMBIGUITY_THRESHOLD}.
 */
export function countAmbiguous(
    matches: EntityMatch[],
    threshold: number = AMBIGUITY_THRESHOLD,
): number {
    return matches.reduce((count, match) => (isAmbiguous(match, threshold) ? count + 1 : count), 0);
}
