import { NextRequest, NextResponse } from 'next/server';
import type { NotificationJobPayload } from '@/lib/queue/types';
import { notifyRunComplete } from '@/lib/notifications/create';

/**
 * POST /api/jobs/notifications
 *
 * QStash webhook handler for notification jobs — the final stage of the
 * post-run pipeline. Creates in-app notifications for the relevant recipients.
 * (Previously missing, so the pipeline's notifications publish 404'd.)
 *
 * Return codes: 200 ok · 400 invalid payload · 500 unexpected (QStash retries).
 *
 * Validates: Requirement 9 (notifications), 4.5 (pipeline stage)
 */

async function handler(request: NextRequest): Promise<NextResponse> {
    let payload: NotificationJobPayload;
    try {
        payload = (await request.json()) as NotificationJobPayload;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const { type, workspaceId, data } = payload;
    if (!type || !workspaceId) {
        return NextResponse.json(
            { error: 'Missing required fields: type, workspaceId' },
            { status: 400 },
        );
    }

    try {
        switch (type) {
            case 'run_complete':
            case 'run_failed': {
                const runId = typeof data?.runId === 'string' ? data.runId : null;
                if (runId) {
                    await notifyRunComplete(runId, workspaceId);
                }
                break;
            }
            default:
                // Other notification types are not implemented yet — accept and ignore.
                console.log(`[notifications] received unhandled type=${type}`);
        }

        return NextResponse.json({ status: 'ok' }, { status: 200 });
    } catch (err) {
        console.error('[notifications] Unexpected error processing job:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// Wrap with QStash signature verification when signing keys are available.
async function createPostHandler() {
    if (process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY) {
        const { verifySignatureAppRouter } = await import('@upstash/qstash/nextjs');
        return verifySignatureAppRouter(handler);
    }
    return handler;
}

const postHandler = createPostHandler();

export async function POST(request: NextRequest): Promise<Response> {
    return (await postHandler)(request);
}
