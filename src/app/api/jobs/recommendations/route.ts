import { NextRequest, NextResponse } from 'next/server';
import type { RecommendationJobPayload } from '@/lib/queue/types';
import { onRecommendationsComplete } from '@/lib/scheduler/pipeline';

/**
 * POST /api/jobs/recommendations
 *
 * QStash webhook handler for recommendation generation jobs.
 *
 * Receives a recommendations job payload after metrics computation completes.
 * The actual recommendation generation logic (LLM-based) is implemented in
 * Phase 6 and will be wired in a follow-up task.
 *
 * After recommendations complete, triggers the notifications pipeline stage.
 *
 * Return codes:
 *   200 — Job processed successfully.
 *   400 — Invalid payload.
 *   500 — Unexpected error (QStash will retry).
 *
 * Validates: Requirement 4.5 (post-execution pipeline trigger)
 */

async function handler(request: NextRequest): Promise<NextResponse> {
    let payload: RecommendationJobPayload;
    try {
        payload = (await request.json()) as RecommendationJobPayload;
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
        console.log(`[recommendations] Recommendations job received for run=${runId}`);

        // TODO: Actual recommendation generation (Phase 6) will be wired here.

        // Trigger pipeline continuation
        await onRecommendationsComplete(runId, workspaceId);

        return NextResponse.json(
            { status: 'ok', runId },
            { status: 200 },
        );
    } catch (err) {
        console.error('[recommendations] Unexpected error processing job:', err);
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
