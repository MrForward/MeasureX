import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api/response';
import { withWorkspaceAccess } from '@/lib/api/rbac';
import type { WorkspaceContext } from '@/lib/api/rbac';
import { createExecution } from '@/lib/engines/execution-store';
import { publishJob } from '@/lib/queue/qstash';
import type { EngineId } from '@/types';
import type { ExecutionJobPayload } from '@/lib/queue/types';

type RouteParams = { workspaceId: string };
type RouteContext = { params: RouteParams } & WorkspaceContext;

/**
 * POST /api/v1/workspaces/:workspaceId/runs
 *
 * Triggers a manual run for the workspace.
 *
 * - Requires owner role (Requirement 1.4)
 * - Enforces a 24-hour cooldown per workspace (Requirement 20.1)
 * - Checks that at least one active prompt exists before creating a run
 * - Creates a Run record (type: 'manual', status: 'queued')
 * - Creates an Execution record (status: 'pending') for each prompt × engine
 * - Publishes execution jobs to QStash (Requirement 4.2 — delivered within 15 min)
 * - Returns 202 Accepted with run ID and execution count
 *
 * Requirement 4.2:  manual run queued and executed within 15 minutes
 * Requirement 20.1: max 1 manual run per workspace per 24 hours
 * Requirement 20.2: manual runs queued behind scheduled runs (QStash handles priority)
 */
export const POST = withWorkspaceAccess<RouteParams>(
    async (_request: NextRequest, { params }: RouteContext) => {
        const { workspaceId } = params;

        // ── 24-hour cooldown check (Requirement 20.1) ──────────────────────────
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const recentManualRun = await db.run.findFirst({
            where: {
                workspaceId,
                type: 'manual',
                createdAt: { gt: twentyFourHoursAgo },
            },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
        });

        if (recentManualRun) {
            const nextAvailableAt = new Date(
                recentManualRun.createdAt.getTime() + 24 * 60 * 60 * 1000,
            );
            return apiError(
                `Manual run already triggered in the last 24 hours. Next run available at: ${nextAvailableAt.toISOString()}`,
                'RATE_LIMITED',
                429,
            );
        }

        // ── Active prompts check ───────────────────────────────────────────────
        const activePrompts = await db.prompt.findMany({
            where: { workspaceId, status: 'active' },
            select: { id: true, engines: true },
        });

        if (activePrompts.length === 0) {
            return apiError('No active prompts to run', 'NO_ACTIVE_PROMPTS', 400);
        }

        // ── Create Run record ─────────────────────────────────────────────────
        const run = await db.run.create({
            data: {
                workspaceId,
                type: 'manual',
                status: 'queued',
            },
            select: { id: true },
        });

        // ── Create Execution records and publish jobs ─────────────────────────
        const jobs: ExecutionJobPayload[] = [];

        for (const prompt of activePrompts) {
            for (const engine of prompt.engines as EngineId[]) {
                const executionId = await createExecution({
                    runId: run.id,
                    promptId: prompt.id,
                    engine,
                    workspaceId,
                });

                jobs.push({
                    runId: run.id,
                    promptId: prompt.id,
                    engine,
                    workspaceId,
                    // Reuse this pre-created execution in the worker (no double-create).
                    executionId,
                });
            }
        }

        const totalExecutions = jobs.length;

        // ── Update run's totalExecutions count ────────────────────────────────
        await db.run.update({
            where: { id: run.id },
            data: { totalExecutions },
        });

        // ── Publish jobs to QStash ────────────────────────────────────────────
        // Fire-and-forget: publish all jobs concurrently.
        // QStash delivers to /api/jobs/execute within seconds (Requirement 4.2).
        await Promise.all(jobs.map((payload) => publishJob('execute', payload)));

        return apiSuccess({ runId: run.id, totalExecutions }, 202);
    },
    'owner',
);

/**
 * GET /api/v1/workspaces/:workspaceId/runs
 *
 * Returns the last 10 runs for the workspace, ordered by createdAt desc.
 * Requires viewer role.
 *
 * Requirement 1.3: viewer = read-only
 * Requirement 13.5: RBAC for all workspace operations
 */
export const GET = withWorkspaceAccess<RouteParams>(
    async (_request: NextRequest, { params }: RouteContext) => {
        const { workspaceId } = params;

        const runs = await db.run.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
                id: true,
                type: true,
                status: true,
                startedAt: true,
                completedAt: true,
                totalExecutions: true,
                successful: true,
                failed: true,
                skipped: true,
                createdAt: true,
            },
        });

        return apiSuccess(runs);
    },
    'viewer',
);
