import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api/response';
import { InviteMemberSchema } from '@/lib/validations/workspace';
import { withWorkspaceAccess } from '@/lib/api/rbac';
import type { WorkspaceContext } from '@/lib/api/rbac';

type RouteParams = { workspaceId: string };
type RouteContext = { params: RouteParams } & WorkspaceContext;

/**
 * GET /api/v1/workspaces/:workspaceId/members
 *
 * Returns all members of the workspace with their user info and role.
 * Requires workspace membership (any role).
 *
 * Requirement 1: workspace management
 * Requirement 13.5: RBAC for all workspace operations
 */
export const GET = withWorkspaceAccess<RouteParams>(
    async (_request: NextRequest, { params }: RouteContext) => {
        const { workspaceId } = params;

        const members = await db.workspaceMember.findMany({
            where: { workspaceId },
            include: {
                user: {
                    select: { id: true, email: true, name: true },
                },
            },
            orderBy: { createdAt: 'asc' },
        });

        const result = members.map((m) => ({
            userId: m.userId,
            role: m.role,
            joinedAt: m.createdAt,
            user: m.user,
        }));

        return apiSuccess(result);
    },
    'viewer',
);

/**
 * POST /api/v1/workspaces/:workspaceId/members
 *
 * Invites a user to the workspace by email.
 * If the user doesn't exist yet, creates a placeholder User record.
 * Requires 'owner' role.
 *
 * Requirement 1.2: owner can invite users with owner/viewer role
 * Requirement 13.5: RBAC for all workspace operations
 * Requirement 13.7: audit logging
 */
export const POST = withWorkspaceAccess<RouteParams>(
    async (request: NextRequest, { params, session }: RouteContext) => {
        const { workspaceId } = params;
        const userId = session.user.id;
        const sessionEmail = session.user.email;

        // Parse and validate body
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiError('Invalid JSON body', 'BAD_REQUEST', 400);
        }

        const parsed = InviteMemberSchema.safeParse(body);
        if (!parsed.success) {
            const message = parsed.error.errors[0]?.message ?? 'Validation failed';
            return apiError(message, 'VALIDATION_ERROR', 400);
        }

        const { email, role } = parsed.data;

        // Cannot invite yourself
        if (email.toLowerCase() === sessionEmail?.toLowerCase()) {
            return apiError('You cannot invite yourself', 'BAD_REQUEST', 400);
        }

        // Look up or create the invited user
        let invitedUser = await db.user.findUnique({
            where: { email: email.toLowerCase() },
            select: { id: true, email: true, name: true },
        });

        if (!invitedUser) {
            // Create a placeholder user — they'll complete signup via magic link
            invitedUser = await db.user.create({
                data: {
                    email: email.toLowerCase(),
                    name: null,
                },
                select: { id: true, email: true, name: true },
            });
        }

        // Check if already a member
        const existingMembership = await db.workspaceMember.findUnique({
            where: {
                workspaceId_userId: { workspaceId, userId: invitedUser.id },
            },
        });

        if (existingMembership) {
            return apiError('User is already a member of this workspace', 'CONFLICT', 409);
        }

        // Create membership + audit log in a transaction
        const newMember = await db.$transaction(async (tx) => {
            const member = await tx.workspaceMember.create({
                data: {
                    workspaceId,
                    userId: invitedUser!.id,
                    role,
                },
                include: {
                    user: {
                        select: { id: true, email: true, name: true },
                    },
                },
            });

            await tx.auditLog.create({
                data: {
                    workspaceId,
                    eventType: 'workspace.member_invited',
                    detailsJson: {
                        invitedBy: userId,
                        invitedUserId: invitedUser!.id,
                        invitedEmail: email,
                        role,
                    },
                },
            });

            return member;
        });

        return apiSuccess(
            {
                userId: newMember.userId,
                role: newMember.role,
                joinedAt: newMember.createdAt,
                user: newMember.user,
            },
            201,
        );
    },
    'owner',
);
