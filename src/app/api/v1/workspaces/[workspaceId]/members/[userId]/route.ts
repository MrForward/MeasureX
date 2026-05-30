import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api/response';
import { UpdateMemberRoleSchema } from '@/lib/validations/workspace';
import { withWorkspaceAccess } from '@/lib/api/rbac';
import type { WorkspaceContext } from '@/lib/api/rbac';

type RouteParams = { workspaceId: string; userId: string };
type RouteContext = { params: RouteParams } & WorkspaceContext;

/**
 * Counts the number of owners in a workspace.
 */
async function countOwners(workspaceId: string): Promise<number> {
    return db.workspaceMember.count({
        where: { workspaceId, role: 'owner' },
    });
}

/**
 * PATCH /api/v1/workspaces/:workspaceId/members/:userId
 *
 * Updates a member's role. Requires 'owner' role.
 * - Cannot change your own role (prevents self-demotion)
 * - Cannot demote the last owner
 *
 * Requirement 1: workspace management
 * Requirement 13.5: RBAC for all workspace operations
 * Requirement 13.7: audit logging
 */
export const PATCH = withWorkspaceAccess<RouteParams>(
    async (request: NextRequest, { params, session }: RouteContext) => {
        const { workspaceId, userId: targetUserId } = params;
        const requesterId = session.user.id;

        // Cannot change your own role
        if (requesterId === targetUserId) {
            return apiError('You cannot change your own role', 'BAD_REQUEST', 400);
        }

        // Verify target user is a member
        const targetMembership = await db.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
            select: { role: true },
        });
        if (!targetMembership) {
            return apiError('Member not found in this workspace', 'NOT_FOUND', 404);
        }

        // Parse and validate body
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiError('Invalid JSON body', 'BAD_REQUEST', 400);
        }

        const parsed = UpdateMemberRoleSchema.safeParse(body);
        if (!parsed.success) {
            const message = parsed.error.errors[0]?.message ?? 'Validation failed';
            return apiError(message, 'VALIDATION_ERROR', 400);
        }

        const { role } = parsed.data;

        // Prevent removing the last owner: if target is currently an owner and
        // we're demoting them, ensure there's at least one other owner.
        if (targetMembership.role === 'owner' && role !== 'owner') {
            const ownerCount = await countOwners(workspaceId);
            if (ownerCount <= 1) {
                return apiError(
                    'Cannot demote the last owner. Assign another owner first.',
                    'CONFLICT',
                    409,
                );
            }
        }

        const updatedMember = await db.$transaction(async (tx) => {
            const updated = await tx.workspaceMember.update({
                where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
                data: { role },
                include: {
                    user: {
                        select: { id: true, email: true, name: true },
                    },
                },
            });

            await tx.auditLog.create({
                data: {
                    workspaceId,
                    eventType: 'workspace.member_role_updated',
                    detailsJson: {
                        updatedBy: requesterId,
                        targetUserId,
                        previousRole: targetMembership.role,
                        newRole: role,
                    },
                },
            });

            return updated;
        });

        return apiSuccess({
            userId: updatedMember.userId,
            role: updatedMember.role,
            joinedAt: updatedMember.createdAt,
            user: updatedMember.user,
        });
    },
    'owner',
);

/**
 * DELETE /api/v1/workspaces/:workspaceId/members/:userId
 *
 * Removes a member from the workspace. Requires 'owner' role.
 * - Cannot remove yourself (use workspace delete instead)
 * - Cannot remove the last owner
 * Returns 204 No Content.
 *
 * Requirement 1: workspace management
 * Requirement 13.5: RBAC for all workspace operations
 * Requirement 13.7: audit logging
 */
export const DELETE = withWorkspaceAccess<RouteParams>(
    async (_request: NextRequest, { params, session }: RouteContext) => {
        const { workspaceId, userId: targetUserId } = params;
        const requesterId = session.user.id;

        // Cannot remove yourself
        if (requesterId === targetUserId) {
            return apiError(
                'You cannot remove yourself. Delete the workspace instead.',
                'BAD_REQUEST',
                400,
            );
        }

        // Verify target user is a member
        const targetMembership = await db.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
            select: { role: true },
        });
        if (!targetMembership) {
            return apiError('Member not found in this workspace', 'NOT_FOUND', 404);
        }

        // Cannot remove the last owner
        if (targetMembership.role === 'owner') {
            const ownerCount = await countOwners(workspaceId);
            if (ownerCount <= 1) {
                return apiError(
                    'Cannot remove the last owner. Assign another owner first.',
                    'CONFLICT',
                    409,
                );
            }
        }

        await db.$transaction(async (tx) => {
            await tx.workspaceMember.delete({
                where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
            });

            await tx.auditLog.create({
                data: {
                    workspaceId,
                    eventType: 'workspace.member_removed',
                    detailsJson: {
                        removedBy: requesterId,
                        removedUserId: targetUserId,
                        role: targetMembership.role,
                    },
                },
            });
        });

        return new Response(null, { status: 204 });
    },
    'owner',
);
