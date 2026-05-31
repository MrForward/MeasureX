/**
 * Aggregate metric computation for the Metric_Engine.
 *
 * These functions roll up per-execution extraction results into higher-level
 * views: a workspace-level average, plus per-prompt and per-engine breakdowns.
 * Every function here is a PURE FUNCTION — identical inputs always produce
 * identical outputs and there are no side effects (no DB, no clock, no I/O).
 *
 * The per-execution Visibility_Score is computed elsewhere (see
 * `computeVisibilityScore` in ./visibility-score) and supplied on each
 * `ScoredExecution`; this module only aggregates already-scored executions.
 *
 * Validates: Requirement 6.2 (workspace-level average weighted equally)
 * Validates: Requirement 6.3 (mention count, average position, citation rate
 *            for each prompt-engine-date combination)
 */

import type { EngineId, ExtractionResult, MentionPosition } from '@/types';

/**
 * A single execution that has already been scored.
 *
 * `visibilityScore` is the 0-100 value produced by `computeVisibilityScore`
 * for this execution's `extraction`. Aggregation treats every execution
 * equally (Requirement 6.2 — "averaging ... weighted equally").
 */
export interface ScoredExecution {
    /** Prompt this execution belongs to. */
    promptId: string;
    /** Engine that produced the response. */
    engine: EngineId;
    /** Collection date in YYYY-MM-DD form. */
    date: string;
    /** Entity-extraction output for this execution. */
    extraction: ExtractionResult;
    /** Visibility score (0-100) already computed via computeVisibilityScore. */
    visibilityScore: number;
}

/** Per-prompt rollup of executions (Requirement 6.3). */
export interface PromptAggregate {
    promptId: string;
    /** Mean visibility score across the prompt's executions (rounded integer). */
    visibilityScore: number;
    /** Number of executions in which the brand was mentioned. */
    mentionCount: number;
    /** Percentage (0-100, one decimal) of executions citing the brand. */
    citationRate: number;
    /** Total executions counted for this prompt. */
    executionCount: number;
}

/** Per-engine rollup of executions (Requirement 6.3). */
export interface EngineAggregate {
    engine: EngineId;
    /** Mean visibility score across the engine's executions (rounded integer). */
    visibilityScore: number;
    /** Number of executions in which the brand was mentioned. */
    mentionCount: number;
    /** Percentage (0-100, one decimal) of executions citing the brand. */
    citationRate: number;
    /** Total executions counted for this engine. */
    executionCount: number;
}

/** Full workspace-level aggregate plus per-prompt and per-engine breakdowns. */
export interface WorkspaceAggregate {
    /** Mean visibility score across every execution (rounded integer). */
    visibilityScore: number;
    /** Number of executions in which the brand was mentioned. */
    mentionCount: number;
    /** Mean first-mention position (first=1..last=3), or null when no mentions. */
    averagePosition: number | null;
    /** Percentage (0-100, one decimal) of executions citing the brand. */
    citationRate: number;
    /** Total executions aggregated. */
    totalExecutions: number;
    /** Breakdown grouped by prompt. */
    byPrompt: PromptAggregate[];
    /** Breakdown grouped by engine. */
    byEngine: EngineAggregate[];
}

/**
 * Numeric weight for a mention position: first third is most prominent.
 * Non-positions (null) are not scored and excluded by callers.
 */
function positionValue(position: MentionPosition): number | null {
    switch (position) {
        case 'first':
            return 1;
        case 'middle':
            return 2;
        case 'last':
            return 3;
        default:
            return null;
    }
}

/** Round to a given number of decimal places without floating-point noise. */
function roundTo(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

/**
 * Workspace-level average Visibility_Score, every execution weighted equally.
 * Returns 0 for an empty set and rounds to the nearest integer.
 *
 * Validates: Requirement 6.2
 */
export function averageVisibilityScore(executions: ScoredExecution[]): number {
    if (executions.length === 0) {
        return 0;
    }
    const total = executions.reduce((sum, e) => sum + e.visibilityScore, 0);
    return Math.round(total / executions.length);
}

/**
 * Count of executions in which the brand was mentioned.
 *
 * Validates: Requirement 6.3
 */
export function mentionCount(executions: ScoredExecution[]): number {
    return executions.reduce(
        (count, e) => count + (e.extraction.brandMentioned ? 1 : 0),
        0
    );
}

/**
 * Average position of the first brand mention (first=1, middle=2, last=3),
 * ignoring executions with no positioned mention. Returns null when there are
 * no positioned mentions to average. Rounded to two decimal places.
 *
 * Validates: Requirement 6.3
 */
export function averageMentionPosition(
    executions: ScoredExecution[]
): number | null {
    let sum = 0;
    let count = 0;
    for (const e of executions) {
        const value = positionValue(e.extraction.mentionPosition);
        if (value !== null) {
            sum += value;
            count += 1;
        }
    }
    if (count === 0) {
        return null;
    }
    return roundTo(sum / count, 2);
}

/**
 * Citation rate: percentage (0-100) of executions in which the brand URL was
 * cited. Returns 0 for an empty set and rounds to one decimal place.
 *
 * Validates: Requirement 6.3
 */
export function citationRate(executions: ScoredExecution[]): number {
    if (executions.length === 0) {
        return 0;
    }
    const cited = executions.reduce(
        (count, e) => count + (e.extraction.brandCited ? 1 : 0),
        0
    );
    return roundTo((cited / executions.length) * 100, 1);
}

/**
 * Group executions by a key, preserving first-seen order of the keys so the
 * output is deterministic for a given input ordering.
 */
function groupBy<K>(
    executions: ScoredExecution[],
    keyOf: (e: ScoredExecution) => K
): Map<K, ScoredExecution[]> {
    const groups = new Map<K, ScoredExecution[]>();
    for (const e of executions) {
        const key = keyOf(e);
        const existing = groups.get(key);
        if (existing) {
            existing.push(e);
        } else {
            groups.set(key, [e]);
        }
    }
    return groups;
}

/**
 * Group executions by prompt and compute a per-prompt aggregate for each.
 * Returns an empty array for empty input.
 *
 * Validates: Requirement 6.3
 */
export function aggregateByPrompt(
    executions: ScoredExecution[]
): PromptAggregate[] {
    const groups = groupBy(executions, (e) => e.promptId);
    const result: PromptAggregate[] = [];
    groups.forEach((group, promptId) => {
        result.push({
            promptId,
            visibilityScore: averageVisibilityScore(group),
            mentionCount: mentionCount(group),
            citationRate: citationRate(group),
            executionCount: group.length,
        });
    });
    return result;
}

/**
 * Group executions by engine and compute a per-engine aggregate for each.
 * Returns an empty array for empty input.
 *
 * Validates: Requirement 6.3
 */
export function aggregateByEngine(
    executions: ScoredExecution[]
): EngineAggregate[] {
    const groups = groupBy(executions, (e) => e.engine);
    const result: EngineAggregate[] = [];
    groups.forEach((group, engine) => {
        result.push({
            engine,
            visibilityScore: averageVisibilityScore(group),
            mentionCount: mentionCount(group),
            citationRate: citationRate(group),
            executionCount: group.length,
        });
    });
    return result;
}

/**
 * Full workspace aggregate: the overall average plus per-prompt and per-engine
 * breakdowns. Safe on empty input (zeros, null position, empty breakdowns).
 *
 * Validates: Requirements 6.2, 6.3
 */
export function computeWorkspaceAggregate(
    executions: ScoredExecution[]
): WorkspaceAggregate {
    return {
        visibilityScore: averageVisibilityScore(executions),
        mentionCount: mentionCount(executions),
        averagePosition: averageMentionPosition(executions),
        citationRate: citationRate(executions),
        totalExecutions: executions.length,
        byPrompt: aggregateByPrompt(executions),
        byEngine: aggregateByEngine(executions),
    };
}
