import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api/response';
import { UpdateWorkspaceSchema } from '@/lib/validations/workspace';
import { withWorkspaceAccess } from '@/lib/api/rbac';
import type { WorkspaceContext } from '@/lib/api/rbac';

type RouteParams = { workspaceId: string };
type RouteContext = { params: RouteParams } & WorkspaceContext;

/**
 * GET /api/v1/workspaces/:workspaceId
 *
 * Returns a single workspace. Requires workspace membership (any role).
 *
 * Requirement 1: workspace management
 * Requirement 13.5: RBAC for all workspace operations
 */
export const GET = withWorkspaceAccess<RouteParams>(
    async (_request: NextRequest, { params, membership }: RouteContext) => {
        const { workspaceId } = params;

        const workspace = await db.workspace.findFirst({
            where: { id: workspaceId, deletedAt: null },
        });
        // Workspace existence is already guaranteed by withWorkspaceAccess,
        // but we need the full record for the response.
        if (!workspace) {
            return apiError('Workspace not found', 'NOT_FOUND', 404);
        }

        return apiSuccess({ ...workspace, role: membership.role });
    },
    'viewer',
);

/**
 * PATCH /api/v1/workspaces/:workspaceId
 *
 * Updates workspace name. Requires 'owner' role.
 *
 * Requirement 1: workspace management
 * Requirement 19: audit trail
 * Requirement 13.5: RBAC for all workspace operations
 */
export const PATCH = withWorkspaceAccess<RouteParams>(
    async (request: NextRequest, { params, session }: RouteContext) => {
        const { workspaceId } = params;
        const userId = session.user.id;

        const workspace = await db.workspace.findFirst({
            where: { id: workspaceId, deletedAt: null },
        });
        if (!workspace) {
            return apiError('Workspace not found', 'NOT_FOUND', 404);
        }

        // Parse and validate body
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiError('Invalid JSON body', 'BAD_REQUEST', 400);
        }

        const parsed = UpdateWorkspaceSchema.safeParse(body);
        if (!parsed.success) {
            const message = parsed.error.errors[0]?.message ?? 'Validation failed';
            return apiError(message, 'VALIDATION_ERROR', 400);
        }

        const updates = parsed.data;

        // Nothing to update
        if (Object.keys(updates).length === 0) {
            return apiSuccess(workspace);
        }

        const updatedWorkspace = await db.$transaction(async (tx) => {
            const updated = await tx.workspace.update({
                where: { id: workspaceId },
                data: updates,
            });

            // Audit log
            await tx.auditLog.create({
                data: {
                    workspaceId,
                    eventType: 'workspace.updated',
                    detailsJson: {
                        userId,
                        changes: updates,
                    },
                },
            });

            return updated;
        });

        return apiSuccess(updatedWorkspace);
    },
    'owner',
);

/**
 * DELETE /api/v1/workspaces/:workspaceId
 *
 * Soft-deletes a workspace by setting deletedAt = now().
 * Requires 'owner' role. Returns 204 No Content.
 *
 * Requirement 1: workspace management
 * Requirement 12.5: soft-delete with 30-day retention
 * Requirement 13.5: RBAC for all workspace operations
 */
export const DELETE = withWorkspaceAccess<RouteParams>(
    async (_request: NextRequest, { params, session }: RouteContext) => {
        const { workspaceId } = params;
        const userId = session.user.id;

        const workspace = await db.workspace.findFirst({
            where: { id: workspaceId, deletedAt: null },
        });
        if (!workspace) {
            return apiError('Workspace not found', 'NOT_FOUND', 404);
        }

        await db.$transaction(async (tx) => {
            // Soft-delete: set deletedAt, never hard-delete
            await tx.workspace.update({
                where: { id: workspaceId },
                data: { deletedAt: new Date() },
            });

            // Audit log
            await tx.auditLog.create({
                data: {
                    workspaceId,
                    eventType: 'workspace.deleted',
                    detailsJson: {
                        userId,
                        changes: { deletedAt: new Date().toISOString() },
                    },
                },
            });
        });

        // 204 No Content — no body
        return new Response(null, { status: 204 });
    },
    'owner',
);
