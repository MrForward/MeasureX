/**
 * Week-over-week change detection for the Metric_Engine.
 *
 * AI answer engines are non-deterministic: the same prompt can produce slightly
 * different responses (and therefore slightly different visibility scores) from
 * one run to the next, even when nothing about the brand has changed. To stop
 * users overreacting to that noise, this module classifies the magnitude of a
 * week-over-week score change:
 *
 *   - small changes (< variance threshold)  → "within normal variance" (noise)
 *   - large changes (>= significant threshold) → "significant shift" (surface it)
 *   - anything in between                     → "notable"
 *
 * Every function here is a PURE FUNCTION — identical inputs always produce
 * identical outputs and there are no side effects (no DB, no clock, no I/O).
 * Thresholds default to the platform CONFIG_DEFAULTS values but can be
 * overridden per-call so callers that have loaded runtime config can pass the
 * tuned values in ("config over code").
 *
 * Validates: Requirement 15.2 (changes < 10 points = "within normal variance")
 * Validates: Requirement 15.4 (changes > 30 points = "significant shift")
 */

import { CONFIG_DEFAULTS } from '@/lib/config/defaults';

/**
 * Magnitude classification of a week-over-week score change.
 *
 * - `within_normal_variance`: |delta| below the variance threshold — treated as
 *   LLM noise, not a genuine trend (Requirement 15.2).
 * - `notable`: a real but moderate change, between the two thresholds.
 * - `significant_shift`: |delta| at or above the significant threshold — surfaced
 *   prominently and fed into recommendations (Requirement 15.4).
 */
export type ChangeClassification =
    | 'within_normal_variance'
    | 'notable'
    | 'significant_shift';

/** Direction of a week-over-week change. */
export type ChangeDirection = 'up' | 'down' | 'flat';

/** A fully-described week-over-week change between two scores. */
export interface WowChange {
    /** The current period's score. */
    current: number;
    /** The previous period's score. */
    previous: number;
    /** current - previous (positive = improvement). */
    delta: number;
    /**
     * Percentage change relative to the previous score, rounded to one decimal.
     * `null` when the previous score is 0 (percentage change is undefined and a
     * division would be Infinity / NaN).
     */
    percentChange: number | null;
    /** 'up' when delta > 0, 'down' when delta < 0, 'flat' when delta === 0. */
    direction: ChangeDirection;
    /** Magnitude bucket based on the absolute delta. */
    classification: ChangeClassification;
}

/**
 * Default thresholds sourced from the platform config registry.
 *
 * These are the fallback values used when a caller does not override them.
 * Keeping them wired to CONFIG_DEFAULTS means the "source of truth" for the
 * numbers stays in one place (the config registry) rather than being duplicated
 * as magic numbers here.
 */
export const DEFAULT_VARIANCE_THRESHOLD = CONFIG_DEFAULTS[
    'scoring.variance_threshold'
].value as number;

export const DEFAULT_SIGNIFICANT_THRESHOLD = CONFIG_DEFAULTS[
    'scoring.significant_shift'
].value as number;

/** Round to a given number of decimal places without floating-point noise. */
function roundTo(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

/**
 * Classify the magnitude of a change from its absolute delta.
 *
 * Boundary semantics (Requirements 15.2 & 15.4):
 *   - |delta| < varianceThreshold       → 'within_normal_variance'
 *   - |delta| >= significantThreshold    → 'significant_shift'
 *   - otherwise                          → 'notable'
 *
 * Note the variance band is a STRICT less-than: a change of exactly the variance
 * threshold (e.g. 10) is no longer "normal variance" and becomes 'notable'. A
 * change of exactly the significant threshold (e.g. 30) IS a 'significant_shift'.
 *
 * Validates: Requirements 15.2, 15.4
 */
export function classifyChange(
    absDelta: number,
    varianceThreshold: number = DEFAULT_VARIANCE_THRESHOLD,
    significantThreshold: number = DEFAULT_SIGNIFICANT_THRESHOLD
): ChangeClassification {
    // Guard against accidental negatives — classification is on magnitude only.
    const magnitude = Math.abs(absDelta);

    if (magnitude >= significantThreshold) {
        return 'significant_shift';
    }
    if (magnitude < varianceThreshold) {
        return 'within_normal_variance';
    }
    return 'notable';
}

/**
 * Compute the week-over-week change between two scores.
 *
 * Pure and deterministic. `delta` is `current - previous`; `direction` follows
 * the sign of the delta; `percentChange` is relative to `previous` (one decimal)
 * and is `null` when `previous` is 0; `classification` buckets the absolute
 * delta via {@link classifyChange}.
 *
 * Validates: Requirements 15.2, 15.4
 */
export function computeWowChange(
    current: number,
    previous: number,
    options?: { varianceThreshold?: number; significantThreshold?: number }
): WowChange {
    const varianceThreshold =
        options?.varianceThreshold ?? DEFAULT_VARIANCE_THRESHOLD;
    const significantThreshold =
        options?.significantThreshold ?? DEFAULT_SIGNIFICANT_THRESHOLD;

    const delta = current - previous;

    let direction: ChangeDirection;
    if (delta > 0) {
        direction = 'up';
    } else if (delta < 0) {
        direction = 'down';
    } else {
        direction = 'flat';
    }

    const percentChange =
        previous === 0 ? null : roundTo((delta / previous) * 100, 1);

    const classification = classifyChange(
        Math.abs(delta),
        varianceThreshold,
        significantThreshold
    );

    return {
        current,
        previous,
        delta,
        percentChange,
        direction,
        classification,
    };
}

/**
 * Change marker for a Baseline_Run (the first run for a prompt/workspace).
 *
 * The first run has no prior period to compare against, so there is no
 * meaningful week-over-week change. This returns `null` to signal "no change to
 * display" — callers should render a baseline indicator rather than a delta.
 *
 * Validates: Requirement 15 (non-determinism handling — baseline has no delta)
 */
export function computeBaselineChange(_current: number): WowChange | null {
    return null;
}
