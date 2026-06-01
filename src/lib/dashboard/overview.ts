/**
 * Dashboard overview data layer.
 *
 * Loads the workspace-level metrics that power the /dashboard overview panel:
 * Visibility_Score, total mentions, citation rate, and week-over-week trends.
 * Also reports `totalPrompts` (active prompts) and `lastRunAt` so the UI can
 * render context around the numbers.
 *
 * Data source: the `metrics` table, which holds one row per
 * (run, prompt, engine) combination (see src/lib/metrics/persist.ts). To
 * produce a workspace-level rollup we aggregate every metric row belonging to
 * the most recent completed (or partial) run.
 *
 * Empty state: many users will land on /dashboard before their first run
 * completes, or while a run is still in progress with no metrics yet. We treat
 * that as a first-class state — `hasData: false` plus zeroed numbers — rather
 * than an error. The caller renders a friendly empty state.
 *
 * Validates: Requirement 7.1 (overview panel: Visibility_Score, total
 *            mentions, citation rate, week-over-week trends)
 * Validates: Requirement 6.4 (week-over-week change values for
 *            Visibility_Score, mention count, citation rate)
 */

import { db } from '@/lib/db';
import { computeWowChange, type WowChange } from '@/lib/metrics/change-detection';

/** Run statuses that contribute metrics to the overview. */
const COMPLETED_STATUSES = ['completed', 'partial'] as const;

/**
 * Workspace-level overview, ready to render.
 *
 * `hasData` is the empty-state flag: when false, the numeric fields are zero
 * and the WoW changes are all null. The UI uses this to switch between empty
 * state and the populated grid.
 */
export interface OverviewData {
    /** False when no completed/partial run with metrics exists yet. */
    hasData: boolean;
    /** Workspace-level Visibility_Score (0-100), averaged over the latest run. */
    visibilityScore: number;
    /** Total brand mentions across the latest run. */
    totalMentions: number;
    /** Citation rate as a percentage (0-100), averaged over the latest run. */
    citationRate: number;
    /** Week-over-week change for each headline metric, or null on first run. */
    wowChange: {
        visibilityScore: WowChange | null;
        totalMentions: WowChange | null;
        citationRate: WowChange | null;
    };
    /** When the latest run finished, or null when no runs have completed. */
    lastRunAt: Date | null;
    /** Count of active (non-archived) prompts in the workspace. */
    totalPrompts: number;
}

/**
 * Result of aggregating a single run's `metrics` rows.
 */
interface RunAggregate {
    visibilityScore: number;
    totalMentions: number;
    citationRate: number;
}

/** Round to one decimal place without floating-point noise. */
function roundTo(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

/**
 * Aggregate the per-prompt-engine metric rows for a single run into one
 * workspace-level number set. Returns null when the run has no metric rows
 * (e.g. a run that was created but never produced metrics).
 *
 * Rationale:
 *   - Visibility_Score: equally-weighted average of every metric row's score.
 *     This matches Requirement 6.2 (workspace-level average weighted equally).
 *   - Total mentions: simple sum across rows.
 *   - Citation rate: equally-weighted average of per-row rates.
 *
 * Pure function — `metrics` is the input slice for one run; no DB access here.
 */
function aggregateRunMetrics(
    metrics: { visibilityScore: number; mentionCount: number; citationRate: number }[],
): RunAggregate | null {
    if (metrics.length === 0) {
        return null;
    }

    let scoreSum = 0;
    let mentionSum = 0;
    let citationSum = 0;
    for (const m of metrics) {
        scoreSum += m.visibilityScore;
        mentionSum += m.mentionCount;
        citationSum += m.citationRate;
    }

    return {
        visibilityScore: Math.round(scoreSum / metrics.length),
        totalMentions: mentionSum,
        citationRate: roundTo(citationSum / metrics.length, 1),
    };
}

/**
 * Empty-state overview shape — the single source of truth for the "no data"
 * case so the UI never has to guess what zeros to render.
 */
function emptyOverview(totalPrompts: number): OverviewData {
    return {
        hasData: false,
        visibilityScore: 0,
        totalMentions: 0,
        citationRate: 0,
        wowChange: {
            visibilityScore: null,
            totalMentions: null,
            citationRate: null,
        },
        lastRunAt: null,
        totalPrompts,
    };
}

/**
 * Load the overview metrics for a workspace.
 *
 * Algorithm:
 *   1. Count active prompts (always shown, regardless of run state).
 *   2. Find the two most recent completed/partial runs (latest + previous).
 *   3. If there is no latest run → return the empty-state shape.
 *   4. Aggregate the latest run's metric rows.
 *   5. If the latest run has no metric rows → also return empty state.
 *   6. If a previous run exists, aggregate it too and compute WoW changes.
 *
 * No throw on missing data — this is a read path that must always succeed so
 * the dashboard can render. Callers handle `hasData` to switch UI states.
 */
export async function loadOverviewData(workspaceId: string): Promise<OverviewData> {
    // Active prompt count is independent of run state — show it even when empty.
    const totalPrompts = await db.prompt.count({
        where: { workspaceId, status: 'active' },
    });

    // Pull the two most recent completed/partial runs in one query so we don't
    // round-trip twice for what is fundamentally one operation.
    const recentRuns = await db.run.findMany({
        where: {
            workspaceId,
            status: { in: [...COMPLETED_STATUSES] },
        },
        orderBy: [
            // completedAt is the truthful ordering for "most recent finished",
            // but it's nullable in the schema, so fall back to createdAt.
            { completedAt: 'desc' },
            { createdAt: 'desc' },
        ],
        take: 2,
        select: {
            id: true,
            completedAt: true,
            createdAt: true,
        },
    });

    if (recentRuns.length === 0) {
        return emptyOverview(totalPrompts);
    }

    const latestRun = recentRuns[0];
    const previousRun = recentRuns[1] ?? null;

    // Pull the metric rows for whichever runs we found in a single query.
    const runIds = previousRun ? [latestRun.id, previousRun.id] : [latestRun.id];
    const metricRows = await db.metric.findMany({
        where: { runId: { in: runIds } },
        select: {
            runId: true,
            visibilityScore: true,
            mentionCount: true,
            citationRate: true,
        },
    });

    const latestMetrics = metricRows.filter((m) => m.runId === latestRun.id);
    const latestAggregate = aggregateRunMetrics(latestMetrics);

    // A run with status=completed but zero metric rows shouldn't happen in
    // practice, but if it does we treat it as "no data yet" rather than
    // showing meaningless zeros next to a real timestamp.
    if (latestAggregate === null) {
        return emptyOverview(totalPrompts);
    }

    let previousAggregate: RunAggregate | null = null;
    if (previousRun) {
        const previousMetrics = metricRows.filter((m) => m.runId === previousRun.id);
        previousAggregate = aggregateRunMetrics(previousMetrics);
    }

    const wowChange = {
        visibilityScore: previousAggregate
            ? computeWowChange(
                latestAggregate.visibilityScore,
                previousAggregate.visibilityScore,
            )
            : null,
        totalMentions: previousAggregate
            ? computeWowChange(
                latestAggregate.totalMentions,
                previousAggregate.totalMentions,
            )
            : null,
        citationRate: previousAggregate
            ? computeWowChange(
                latestAggregate.citationRate,
                previousAggregate.citationRate,
            )
            : null,
    };

    return {
        hasData: true,
        visibilityScore: latestAggregate.visibilityScore,
        totalMentions: latestAggregate.totalMentions,
        citationRate: latestAggregate.citationRate,
        wowChange,
        lastRunAt: latestRun.completedAt ?? latestRun.createdAt,
        totalPrompts,
    };
}
