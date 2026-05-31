/**
 * Run success rate tracking — monthly aggregate computation.
 *
 * Computes the monthly execution success rate across all workspaces and
 * checks against the 95% threshold (Requirement 4.9, Requirement 14.1).
 *
 * The alert/notification wiring will be added in Phase 6 (Notifications).
 *
 * Validates: Requirement 4.9  (run success rate ≥ 95% monthly)
 * Validates: Requirement 14.1 (100 concurrent workspaces without degradation)
 */

import { db } from '@/lib/db';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MonthlySuccessRate {
    /** The month queried (YYYY-MM format). */
    month: string;
    /** Total executions in the month. */
    totalExecutions: number;
    /** Successful executions in the month. */
    successfulExecutions: number;
    /** Success rate as a percentage (0-100). */
    rate: number;
    /** True if rate < 95% — indicates an alert should be raised. */
    belowThreshold: boolean;
}

/** The minimum acceptable success rate (percentage). */
const SUCCESS_RATE_THRESHOLD = 95;

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Compute the monthly run success rate across all executions.
 *
 * Queries all executions created within the given month and computes:
 *   rate = (successful / total) * 100
 *
 * An execution is "successful" if its status is 'success'.
 * Skipped executions count toward total but NOT toward successful
 * (they represent degraded service).
 *
 * @param month - Month in YYYY-MM format (e.g. "2024-03")
 * @returns Monthly success rate data including threshold check
 */
export async function computeMonthlySuccessRate(month: string): Promise<MonthlySuccessRate> {
    // Parse month boundaries
    const { startDate, endDate } = getMonthBoundaries(month);

    // Count total executions in the month (all terminal statuses)
    const totalExecutions = await db.execution.count({
        where: {
            createdAt: {
                gte: startDate,
                lt: endDate,
            },
            status: { in: ['success', 'failed', 'skipped'] },
        },
    });

    // Count successful executions
    const successfulExecutions = await db.execution.count({
        where: {
            createdAt: {
                gte: startDate,
                lt: endDate,
            },
            status: 'success',
        },
    });

    // Compute rate (avoid division by zero)
    const rate = totalExecutions > 0
        ? Math.round((successfulExecutions / totalExecutions) * 10000) / 100
        : 100; // No executions = no failures = 100%

    const belowThreshold = rate < SUCCESS_RATE_THRESHOLD;

    return {
        month,
        totalExecutions,
        successfulExecutions,
        rate,
        belowThreshold,
    };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a YYYY-MM string into start/end Date boundaries.
 *
 * @param month - Month string in YYYY-MM format
 * @returns Start (inclusive) and end (exclusive) dates for the month
 */
function getMonthBoundaries(month: string): { startDate: Date; endDate: Date } {
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1; // 0-indexed

    const startDate = new Date(Date.UTC(year, monthIndex, 1));
    const endDate = new Date(Date.UTC(year, monthIndex + 1, 1));

    return { startDate, endDate };
}
