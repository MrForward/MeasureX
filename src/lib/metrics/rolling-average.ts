/**
 * Rolling N-week average Visibility_Score computation for the Metric_Engine.
 *
 * AI answer engines are non-deterministic: the same prompt can yield slightly
 * different responses (and therefore slightly different visibility scores) from
 * one weekly run to the next, even when nothing about the brand has changed.
 * A point-in-time score is therefore noisy. To surface the underlying trend
 * rather than week-to-week jitter, this module computes a rolling average over
 * a sliding window of recent weeks (default 4) alongside the point-in-time
 * score (Requirement 15.3).
 *
 * Every function here is a PURE FUNCTION — identical inputs always produce
 * identical outputs and there are no side effects (no DB, no clock, no I/O).
 * Input is sorted defensively by ISO week string before computing, so callers
 * need not guarantee ordering. ISO week strings ("YYYY-Www") sort correctly as
 * plain strings because the fixed-width year and zero-padded week number make
 * lexicographic order match chronological order.
 *
 * Validates: Requirement 15.3 (rolling 4-week average for trend smoothing)
 */

/** Default sliding-window size, in weeks (Requirement 15.3 — "4-week average"). */
export const DEFAULT_WINDOW_WEEKS = 4;

/** A single week's point-in-time Visibility_Score. */
export interface WeeklyScore {
    /** ISO week identifier, e.g. "2024-W03". */
    week: string;
    /** Point-in-time visibility score (0-100) for that week. */
    score: number;
}

/** A single point in a smoothed rolling-average series. */
export interface RollingAveragePoint {
    /** ISO week this point corresponds to. */
    week: string;
    /** Rolling average of this week and the up-to-(window-1) preceding weeks. */
    rollingAvg: number;
}

/**
 * Sort scores by ISO week ascending without mutating the caller's array.
 *
 * ISO week strings are fixed-width ("YYYY-Www"), so lexicographic ordering of
 * the strings is identical to chronological ordering — no date parsing needed.
 */
function sortByWeek(scores: WeeklyScore[]): WeeklyScore[] {
    return [...scores].sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0));
}

/** Mean of a non-empty list of numbers, rounded to the nearest integer. */
function roundedMean(values: number[]): number {
    const total = values.reduce((sum, v) => sum + v, 0);
    return Math.round(total / values.length);
}

/** Normalize a requested window to a positive integer, falling back to default. */
function normalizeWindow(windowWeeks?: number): number {
    if (windowWeeks === undefined || !Number.isFinite(windowWeeks) || windowWeeks < 1) {
        return DEFAULT_WINDOW_WEEKS;
    }
    return Math.floor(windowWeeks);
}

/**
 * Compute the rolling N-week average ending at the most recent week.
 *
 * Takes the last `windowWeeks` scores (after sorting ascending by week),
 * averages them, and rounds to the nearest integer. When fewer than
 * `windowWeeks` scores exist, it averages whatever is available. Returns `null`
 * for empty input (there is no average to report).
 *
 * Validates: Requirement 15.3
 */
export function rollingAverage(
    scores: WeeklyScore[],
    windowWeeks: number = DEFAULT_WINDOW_WEEKS
): number | null {
    if (scores.length === 0) {
        return null;
    }
    const window = normalizeWindow(windowWeeks);
    const sorted = sortByWeek(scores);
    const recent = sorted.slice(Math.max(0, sorted.length - window));
    return roundedMean(recent.map((s) => s.score));
}

/**
 * Compute a smoothed rolling-average series — one entry per input week.
 *
 * For each week i (in ascending order), the entry is the average of that week
 * and the up-to-(window-1) immediately preceding weeks, i.e. scores in the
 * index range [max(0, i - window + 1) .. i]. The first entry therefore equals
 * the first week's score (a window of one), and each subsequent entry widens
 * the window until it reaches `windowWeeks`. Returns an empty array for empty
 * input.
 *
 * Validates: Requirement 15.3
 */
export function rollingAverageSeries(
    scores: WeeklyScore[],
    windowWeeks: number = DEFAULT_WINDOW_WEEKS
): RollingAveragePoint[] {
    if (scores.length === 0) {
        return [];
    }
    const window = normalizeWindow(windowWeeks);
    const sorted = sortByWeek(scores);

    return sorted.map((entry, i) => {
        const start = Math.max(0, i - window + 1);
        const windowScores = sorted.slice(start, i + 1).map((s) => s.score);
        return {
            week: entry.week,
            rollingAvg: roundedMean(windowScores),
        };
    });
}
