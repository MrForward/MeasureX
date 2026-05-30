import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiSuccess } from '@/lib/api/response';
import { withWorkspaceAccess } from '@/lib/api/rbac';
import type { WorkspaceContext } from '@/lib/api/rbac';

type RouteParams = { workspaceId: string };
type RouteContext = { params: RouteParams } & WorkspaceContext;

/**
 * GET /api/v1/workspaces/:workspaceId/brand/history
 *
 * Returns all versions of the brand profile for the workspace,
 * ordered by version descending (newest first).
 *
 * Requires viewer role.
 * Useful for debugging and audit purposes.
 *
 * Requirement 12.2: brand profile versioning
 * Requirement 12.4: querying historical metrics by brand profile version
 * Requirement 19: audit trail / data traceability
 * Requirement 13.5: RBAC for all workspace operations
 */
export const GET = withWorkspaceAccess<RouteParams>(
    async (_request: NextRequest, { params }: RouteContext) => {
        const { workspaceId } = params;

        const versions = await db.brandProfile.findMany({
            where: { workspaceId },
            orderBy: { version: 'desc' },
        });

        return apiSuccess(versions);
    },
    'viewer',
);
