import { NextRequest, NextResponse } from 'next/server';
import type { ExecutionJobPayload } from '@/lib/queue/types';
import { executeJob } from '@/lib/scheduler/execute-job';

/**
 * POST /api/jobs/execute
 *
 * QStash webhook handler for execution jobs.
 *
 * QStash calls this endpoint when an execution job is ready to be processed.
 * The handler verifies the QStash signature, parses the payload, and
 * dispatches the job to the appropriate engine adapter via executeJob().
 *
 * Security: The `verifySignatureAppRouter` wrapper rejects any request that
 * does not carry a valid QStash HMAC signature, preventing unauthorized
 * job injection.
 *
 * Return codes:
 *   200 — Job processed (success, skipped, or non-retryable failure).
 *         QStash will NOT retry.
 *   400 — Invalid payload (malformed JSON or missing fields).
 *         QStash will NOT retry (client error).
 *   500 — Unexpected error. QStash WILL retry (up to 3 times).
 *
 * Validates: Requirement 4.7  (retry up to 3 times with exponential backoff)
 * Validates: Requirement 4.8  (continue processing remaining prompts on failure)
 * Validates: Requirement 18.1 (partial failure handling)
 */

async function handler(request: NextRequest): Promise<NextResponse> {
    // Parse the job payload from the request body
    let payload: ExecutionJobPayload;
    try {
        payload = (await request.json()) as ExecutionJobPayload;
    } catch {
        return NextResponse.json(
            { error: 'Invalid JSON payload' },
            { status: 400 },
        );
    }

    const { runId, promptId, engine, workspaceId } = payload;

    // Validate required fields
    if (!runId || !promptId || !engine || !workspaceId) {
        return NextResponse.json(
            { error: 'Missing required fields: runId, promptId, engine, workspaceId' },
            { status: 400 },
        );
    }

    // Execute the job — all handled outcomes return 200 to prevent QStash retries
    try {
        const result = await executeJob(payload);

        return NextResponse.json(
            { status: result.status, executionId: result.executionId, error: result.error },
            { status: 200 },
        );
    } catch (err) {
        // Unexpected error — return 500 so QStash retries
        console.error('[execute] Unexpected error processing job:', err);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 },
        );
    }
}

// Wrap with QStash signature verification when signing keys are available.
// In development (or during build) the keys may not be set, so we fall back
// to the unwrapped handler to avoid a module-load-time crash.
async function createPostHandler() {
    if (
        process.env.QSTASH_CURRENT_SIGNING_KEY &&
        process.env.QSTASH_NEXT_SIGNING_KEY
    ) {
        const { verifySignatureAppRouter } = await import('@upstash/qstash/nextjs');
        return verifySignatureAppRouter(handler);
    }
    // No signing keys — allow unauthenticated calls (dev/build only)
    return handler;
}

const postHandler = createPostHandler();

export async function POST(request: NextRequest): Promise<Response> {
    return (await postHandler)(request);
}
