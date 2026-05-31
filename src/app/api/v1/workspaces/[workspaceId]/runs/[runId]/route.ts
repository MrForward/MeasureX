import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api/response';
import { withWorkspaceAccess } from '@/lib/api/rbac';
import type { WorkspaceContext } from '@/lib/api/rbac';

type RouteParams = { workspaceId: string; runId: string };
type RouteContext = { params: RouteParams } & WorkspaceContext;

/**
 * GET /api/v1/workspaces/:workspaceId/runs/:runId
 *
 * Returns a single run with all its executions.
 * Requires viewer role.
 *
 * Requirement 1.3:  viewer = read-only
 * Requirement 13.5: RBAC for all workspace operations
 * Requirement 19.1: immutable audit trail — executions are never deleted
 */
export const GET = withWorkspaceAccess<RouteParams>(
    async (_request: NextRequest, { params }: RouteContext) => {
        const { workspaceId, runId } = params;

        const run = await db.run.findFirst({
            where: { id: runId, workspaceId },
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
                executions: {
                    select: {
                        id: true,
                        engine: true,
                        status: true,
                        modelVersion: true,
                        executionTimeMs: true,
                        errorDetails: true,
                        createdAt: true,
                    },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });

        if (!run) {
            return apiError('Run not found', 'NOT_FOUND', 404);
        }

        return apiSuccess(run);
    },
    'viewer',
);
