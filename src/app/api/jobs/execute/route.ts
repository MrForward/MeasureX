import { NextRequest, NextResponse } from 'next/server';
import type { ExecutionJobPayload } from '@/lib/queue/types';

/**
 * POST /api/jobs/execute
 *
 * QStash webhook handler for execution jobs.
 *
 * QStash calls this endpoint when an execution job is ready to be processed.
 * The handler verifies the QStash signature, parses the payload, and
 * dispatches the job to the appropriate engine adapter.
 *
 * Security: The `verifySignatureAppRouter` wrapper rejects any request that
 * does not carry a valid QStash HMAC signature, preventing unauthorized
 * job injection.
 *
 * Token burn protection: Before processing, the handler checks the platform
 * kill switch in Redis. If the kill switch is active, the job is acknowledged
 * (200 OK) without processing to prevent QStash from retrying indefinitely.
 *
 * Phase 2 note: Actual engine execution (calling ChatGPT, Perplexity, etc.)
 * will be wired up in Phase 2. This skeleton establishes the handler
 * structure, signature verification, and kill-switch guard.
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

    // Token burn protection — check platform kill switch before processing.
    // The kill switch is stored in Redis as "platform:kill_switch" (boolean).
    // If active, acknowledge the job without processing so QStash stops retrying.
    try {
        const { redis } = await import('@/lib/queue/redis');
        const killSwitch = await redis.get<boolean>('platform:kill_switch');
        if (killSwitch === true) {
            console.warn('[execute] Platform kill switch is active — skipping job', {
                runId,
                promptId,
                engine,
                workspaceId,
            });
            return NextResponse.json(
                { status: 'skipped', reason: 'kill_switch_active' },
                { status: 200 },
            );
        }
    } catch (err) {
        // Redis unavailable — log and continue (fail open to avoid blocking all jobs)
        console.error('[execute] Failed to check kill switch:', err);
    }

    // Log the job (Phase 2: replace with actual engine execution)
    console.log('[execute] Job received', {
        runId,
        promptId,
        engine,
        workspaceId,
        receivedAt: new Date().toISOString(),
    });

    // TODO (Phase 2): Dispatch to engine adapter
    //   const adapter = engineRegistry.get(engine);
    //   const response = await adapter.execute({ promptId, runId, workspaceId });
    //   await storeExecution(response);
    //   await publishJob('extract', { executionId: response.id, workspaceId });

    return NextResponse.json(
        { status: 'accepted', runId, promptId, engine },
        { status: 200 },
    );
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
