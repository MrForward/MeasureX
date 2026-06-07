import { NextRequest, NextResponse } from 'next/server';
import type { MetricsJobPayload } from '@/lib/queue/types';
import { computeRunMetrics } from '@/lib/metrics/compute-run-metrics';
import { onMetricsComplete } from '@/lib/scheduler/pipeline';

/**
 * POST /api/jobs/metrics
 *
 * QStash webhook handler for metrics computation jobs.
 *
 * Receives a metrics job payload after all extractions for a run are complete.
 * The actual metrics computation logic (visibility scores, aggregates) is
 * implemented in Phase 3 and will be wired in a follow-up task.
 *
 * After metrics complete, triggers the recommendations pipeline stage.
 *
 * Return codes:
 *   200 — Job processed successfully.
 *   400 — Invalid payload.
 *   500 — Unexpected error (QStash will retry).
 *
 * Validates: Requirement 4.5 (post-execution pipeline trigger)
 */

async function handler(request: NextRequest): Promise<NextResponse> {
    let payload: MetricsJobPayload;
    try {
        payload = (await request.json()) as MetricsJobPayload;
    } catch {
        return NextResponse.json(
            { error: 'Invalid JSON payload' },
            { status: 400 },
        );
    }

    const { runId, workspaceId } = payload;

    if (!runId || !workspaceId) {
        return NextResponse.json(
            { error: 'Missing required fields: runId, workspaceId' },
            { status: 400 },
        );
    }

    try {
        console.log(`[metrics] Metrics job received for run=${runId}`);

        // Compute and persist per-prompt-engine metric rows for the run.
        const persisted = await computeRunMetrics(runId, workspaceId);
        console.log(`[metrics] run=${runId} persisted ${persisted} metric row(s)`);

        // Trigger pipeline continuation (publishes recommendations job).
        await onMetricsComplete(runId, workspaceId);

        return NextResponse.json(
            { status: 'ok', runId },
            { status: 200 },
        );
    } catch (err) {
        console.error('[metrics] Unexpected error processing job:', err);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 },
        );
    }
}

// Wrap with QStash signature verification when signing keys are available.
async function createPostHandler() {
    if (
        process.env.QSTASH_CURRENT_SIGNING_KEY &&
        process.env.QSTASH_NEXT_SIGNING_KEY
    ) {
        const { verifySignatureAppRouter } = await import('@upstash/qstash/nextjs');
        return verifySignatureAppRouter(handler);
    }
    return handler;
}

const postHandler = createPostHandler();

export async function POST(request: NextRequest): Promise<Response> {
    return (await postHandler)(request);
}
