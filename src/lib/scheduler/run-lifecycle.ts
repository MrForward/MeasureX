/**
 * Run lifecycle management — state transitions for monitoring runs.
 *
 * Handles:
 *   - Marking a run as 'in_progress' when the first execution starts
 *   - Checking if all executions are done and triggering finalization
 *
 * Validates: Requirement 4.4  (run status tracking: queued → in_progress → completed/partial/failed)
 * Validates: Requirement 18.1 (partial failure handling)
 * Validates: Requirement 19.1 (immutable audit trail — run state transitions recorded)
 */

import { db } from '@/lib/db';
import { finalizeRun } from '@/lib/engines/execution-store';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RunCompletionResult {
    complete: boolean;
    status?: string;
}

// ── State transitions ─────────────────────────────────────────────────────────

/**
 * Mark a run as 'in_progress' when the first execution starts.
 *
 * Idempotent — if the run is already 'in_progress' or in a later state
 * (completed, partial, failed), this is a no-op.
 *
 * Only transitions from 'queued' → 'in_progress'.
 */
export async function markRunInProgress(runId: string): Promise<void> {
    const run = await db.run.findUnique({
        where: { id: runId },
        select: { status: true },
    });

    if (!run || run.status !== 'queued') {
        // Already in_progress or later — no-op (idempotent)
        return;
    }

    await db.run.update({
        where: { id: runId },
        data: {
            status: 'in_progress',
            startedAt: new Date(),
        },
    });
}

/**
 * Check if all executions for a run are done (no 'pending' status remaining).
 *
 * If all executions have completed (success/failed/skipped), calls `finalizeRun`
 * to determine and set the final run status (completed/partial/failed).
 *
 * Returns whether the run is complete and, if so, the final status.
 */
export async function checkRunCompletion(runId: string): Promise<RunCompletionResult> {
    const pendingCount = await db.execution.count({
        where: {
            runId,
            status: 'pending',
        },
    });

    if (pendingCount > 0) {
        return { complete: false };
    }

    // All executions are done — finalize the run
    await finalizeRun(runId);

    // Read back the final status
    const run = await db.run.findUnique({
        where: { id: runId },
        select: { status: true },
    });

    return { complete: true, status: run?.status };
}
