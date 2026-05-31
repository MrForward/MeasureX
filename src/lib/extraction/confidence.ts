/**
 * Confidence scoring — single source of truth for the entity extraction
 * pipeline.
 *
 * Confidence reflects how certain the extractor is that a detected span really
 * is a mention of the target entity. It is consumed downstream by ambiguity
 * flagging (task 3.7, confidence < 'extraction.confidence_threshold').
 *
 * This module centralizes ALL confidence logic so it is testable and tunable in
 * one place. Both the exact matcher and the fuzzy matcher derive their
 * confidence from here rather than hardcoding values inline.
 *
 * The two rules are:
 *   - exact match → always 1.0 (design Property 8);
 *   - fuzzy match → 1 - editDistance * CONFIDENCE_PENALTY_PER_EDIT, clamped to
 *     [MIN_FUZZY_CONFIDENCE, MAX_FUZZY_CONFIDENCE] so a fuzzy match is never as
 *     certain as an exact one and never drops below the ambiguity floor.
 *
 * All functions are pure and deterministic (no I/O, no global state).
 *
 * Validates: Requirement 5.6 (assign Confidence_Score in the range 0-1)
 * Validates: design Property 8 (FOR ALL exact matches, confidence SHALL be 1.0)
 */

import type { MatchType } from './types';

/** Confidence for an exact match — always 1.0 (design Property 8). */
export const EXACT_MATCH_CONFIDENCE = 1.0;

/**
 * Lower bound for a fuzzy match's confidence. A fuzzy match is never reported
 * below this value; instead, matches too far away are rejected upstream by the
 * fuzzy matcher's edit-distance cap.
 */
export const MIN_FUZZY_CONFIDENCE = 0.5;

/**
 * Upper bound for a fuzzy match's confidence. Always strictly below an exact
 * match's 1.0 so the two match types can never be confused on confidence alone.
 */
export const MAX_FUZZY_CONFIDENCE = 0.9;

/**
 * Confidence subtracted per unit of edit distance for a fuzzy match.
 *
 * With this penalty: distance 1 → 0.825, distance 2 → 0.65. Distance 3 would be
 * 0.475 but is clamped up to {@link MIN_FUZZY_CONFIDENCE}.
 */
export const CONFIDENCE_PENALTY_PER_EDIT = 0.175;

/** Clamp a value into the inclusive [min, max] range. */
function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * Compute the confidence for a fuzzy match from its Levenshtein edit distance:
 *
 *   confidence = clamp(1 - editDistance * CONFIDENCE_PENALTY_PER_EDIT,
 *                      MIN_FUZZY_CONFIDENCE, MAX_FUZZY_CONFIDENCE)
 *
 * Examples: distance 0 → 0.9 (clamped down from 1.0, since fuzzy is capped
 * below exact), distance 1 → 0.825, distance 2 → 0.65, distance ≥ 3 → 0.5
 * (clamped up). The result is always within [0.5, 0.9].
 */
export function fuzzyConfidence(editDistance: number): number {
    return clamp(
        1 - editDistance * CONFIDENCE_PENALTY_PER_EDIT,
        MIN_FUZZY_CONFIDENCE,
        MAX_FUZZY_CONFIDENCE,
    );
}

/**
 * Compute the confidence for any match given its type and (for fuzzy matches)
 * its edit distance.
 *
 * - `'exact'` → {@link EXACT_MATCH_CONFIDENCE} (1.0); any `editDistance` is
 *   ignored because an exact match is, by definition, distance 0.
 * - `'fuzzy'` → {@link fuzzyConfidence} of the supplied `editDistance`. When no
 *   distance is provided it defaults to 0, yielding the maximum fuzzy
 *   confidence (0.9).
 */
export function computeConfidence(matchType: MatchType, editDistance = 0): number {
    return matchType === 'exact' ? EXACT_MATCH_CONFIDENCE : fuzzyConfidence(editDistance);
}
