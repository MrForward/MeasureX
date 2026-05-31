import { NextRequest, NextResponse } from 'next/server';
import type { ExtractionJobPayload } from '@/lib/queue/types';
import { db } from '@/lib/db';
import { onExtractionComplete } from '@/lib/scheduler/pipeline';

/**
 * POST /api/jobs/extract
 *
 * QStash webhook handler for extraction jobs.
 *
 * Receives an extraction job payload after a successful execution.
 * The actual extraction logic (entity extraction, citation analysis) is
 * implemented in Phase 3 and will be wired in a follow-up task.
 *
 * After extraction completes, triggers the pipeline check to determine
 * if all extractions for the run are done (and if so, publish metrics job).
 *
 * Return codes:
 *   200 — Job processed successfully.
 *   400 — Invalid payload.
 *   500 — Unexpected error (QStash will retry).
 *
 * Validates: Requirement 4.5 (post-execution pipeline trigger)
 */

async function handler(request: NextRequest): Promise<NextResponse> {
    let payload: ExtractionJobPayload;
    try {
        payload = (await request.json()) as ExtractionJobPayload;
    } catch {
        return NextResponse.json(
            { error: 'Invalid JSON payload' },
            { status: 400 },
        );
    }

    const { executionId, workspaceId } = payload;

    if (!executionId || !workspaceId) {
        return NextResponse.json(
            { error: 'Missing required fields: executionId, workspaceId' },
            { status: 400 },
        );
    }

    try {
        console.log(`[extract] Extraction job received for execution=${executionId}`);

        // Look up the execution to get the runId
        const execution = await db.execution.findUnique({
            where: { id: executionId },
            select: { runId: true },
        });

        if (!execution) {
            return NextResponse.json(
                { error: 'Execution not found' },
                { status: 400 },
            );
        }

        // TODO: Actual extraction logic (Phase 3) will be wired here.
        // For now, the extraction record is created by the extraction pipeline modules.

        // Trigger pipeline continuation
        await onExtractionComplete(executionId, workspaceId, execution.runId);

        return NextResponse.json(
            { status: 'ok', executionId },
            { status: 200 },
        );
    } catch (err) {
        console.error('[extract] Unexpected error processing job:', err);
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
