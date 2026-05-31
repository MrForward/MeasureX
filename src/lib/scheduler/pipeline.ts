/**
 * Post-execution pipeline orchestration.
 *
 * Manages the async pipeline chain:
 *   Execution completes → publish 'extract' job (already done in execute-job.ts)
 *   Extraction completes → check all extractions done → publish 'metrics' job
 *   Metrics complete → publish 'recommendations' job
 *   Recommendations complete → publish 'notifications' job
 *
 * Key invariant: The metrics job fires ONCE per run, only after ALL successful
 * executions have been extracted. This prevents partial metric computation.
 *
 * Validates: Requirement 4.5 (post-execution pipeline trigger)
 */

import { db } from '@/lib/db';
import { publishJob } from '@/lib/queue/qstash';

// ── Extraction completion check ───────────────────────────────────────────────

/**
 * Check if all successful executions for a run have been extracted.
 *
 * Returns true when no executions remain with status='success' that lack
 * an extraction record. This ensures the metrics job only fires once all
 * extraction results are available.
 */
export async function areAllExtractionsComplete(runId: string): Promise<boolean> {
    const unextractedCount = await db.execution.count({
        where: {
            runId,
            status: 'success',
            extraction: null,
        },
    });

    return unextractedCount === 0;
}

// ── Pipeline stage triggers ───────────────────────────────────────────────────

/**
 * Called after an extraction job completes for a single execution.
 *
 * Checks whether ALL extractions for the run are done. If yes, publishes
 * the metrics job. If not, does nothing (waits for remaining extractions).
 *
 * This ensures the metrics job fires exactly once per run.
 */
export async function onExtractionComplete(
    executionId: string,
    workspaceId: string,
    runId: string,
): Promise<void> {
    const allDone = await areAllExtractionsComplete(runId);

    if (allDone) {
        await publishJob('metrics', { runId, workspaceId });
    }
    // If not all done, do nothing — wait for remaining extractions
}

/**
 * Called after the metrics job completes for a run.
 *
 * Triggers the recommendations pipeline stage.
 */
export async function onMetricsComplete(
    runId: string,
    workspaceId: string,
): Promise<void> {
    await publishJob('recommendations', { runId, workspaceId });
}

/**
 * Called after the recommendations job completes for a run.
 *
 * Triggers the notifications pipeline stage (run_complete notification).
 */
export async function onRecommendationsComplete(
    runId: string,
    workspaceId: string,
): Promise<void> {
    await publishJob('notifications', {
        type: 'run_complete',
        workspaceId,
        userId: '',
        data: { runId },
    });
}
