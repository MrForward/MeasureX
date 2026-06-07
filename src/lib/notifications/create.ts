/**
 * In-app notification creation.
 *
 * Persists Notification rows for the relevant recipients (workspace owners).
 * Email delivery (Resend) is a later enhancement; this covers the in-app bell.
 *
 * Validates: Requirement 9 (notifications), 18.4 (run-completion summary
 *            includes skipped/failed executions), 6.5 (in-app notifications)
 */

import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export type NotificationType = 'run_complete' | 'run_failed';

/** Resolve the user ids that should receive workspace notifications (owners). */
async function ownerUserIds(workspaceId: string): Promise<string[]> {
    const owners = await db.workspaceMember.findMany({
        where: { workspaceId, role: 'owner' },
        select: { userId: true },
    });
    return owners.map((o) => o.userId);
}

/** Create one notification per owner. No-op when there are no owners. */
export async function notifyOwners(
    workspaceId: string,
    type: NotificationType,
    content: Prisma.InputJsonObject,
): Promise<number> {
    const userIds = await ownerUserIds(workspaceId);
    if (userIds.length === 0) return 0;

    await db.notification.createMany({
        data: userIds.map((userId) => ({ workspaceId, userId, type, content })),
    });
    return userIds.length;
}

/**
 * Build + persist the run-completion notification for a run's owners.
 *
 * The message reflects partial failures (Req 18.4): a clean run reads "complete",
 * a run with failures reads "completed with N issues".
 */
export async function notifyRunComplete(
    runId: string,
    workspaceId: string,
): Promise<void> {
    const run = await db.run.findUnique({
        where: { id: runId },
        select: { status: true, successful: true, failed: true, skipped: true, totalExecutions: true },
    });
    if (!run) return;

    const issues = run.failed + run.skipped;
    const failed = run.status === 'failed';

    const title = failed
        ? 'Scan failed'
        : issues > 0
          ? `Scan completed with ${issues} issue${issues === 1 ? '' : 's'}`
          : 'Scan complete';

    const message = failed
        ? 'Most engine calls failed — see the run details.'
        : 'Your visibility scores and recommendations are updated.';

    await notifyOwners(workspaceId, failed ? 'run_failed' : 'run_complete', {
        runId,
        title,
        message,
        successful: run.successful,
        failed: run.failed,
        skipped: run.skipped,
        total: run.totalExecutions,
    });
}
