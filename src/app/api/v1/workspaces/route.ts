import { NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth/utils';
import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api/response';
import { CreateWorkspaceSchema } from '@/lib/validations/workspace';

/**
 * GET /api/v1/workspaces
 *
 * Returns all non-deleted workspaces the authenticated user is a member of,
 * including the user's role in each workspace.
 *
 * Requirement 1: workspace management
 */
export async function GET() {
    const session = await getServerSession();
    if (!session?.user?.id) {
        return apiError('Authentication required', 'UNAUTHORIZED', 401);
    }

    const userId = session.user.id;

    const memberships = await db.workspaceMember.findMany({
        where: {
            userId,
            workspace: {
                deletedAt: null,
            },
        },
        include: {
            workspace: true,
        },
        orderBy: {
            createdAt: 'asc',
        },
    });

    const workspaces = memberships.map((m) => ({
        ...m.workspace,
        role: m.role,
    }));

    return apiSuccess(workspaces);
}

/**
 * POST /api/v1/workspaces
 *
 * Creates a new workspace for the authenticated user.
 * Auto-creates a WorkspaceMember record with role='owner'.
 * Auto-creates a default BrandProfile placeholder.
 *
 * Requirement 1: workspace management
 * Requirement 12.5: soft-delete with 30-day retention
 */
export async function POST(request: NextRequest) {
    const session = await getServerSession();
    if (!session?.user?.id) {
        return apiError('Authentication required', 'UNAUTHORIZED', 401);
    }

    const userId = session.user.id;

    // Parse and validate request body
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError('Invalid JSON body', 'BAD_REQUEST', 400);
    }

    const parsed = CreateWorkspaceSchema.safeParse(body);
    if (!parsed.success) {
        const message = parsed.error.errors[0]?.message ?? 'Validation failed';
        return apiError(message, 'VALIDATION_ERROR', 400);
    }

    const { name } = parsed.data;

    // Create workspace + member + brand profile + audit log in a transaction
    const workspace = await db.$transaction(async (tx) => {
        // 1. Create the workspace
        const newWorkspace = await tx.workspace.create({
            data: {
                name,
                ownerId: userId,
            },
        });

        // 2. Auto-create owner membership
        await tx.workspaceMember.create({
            data: {
                workspaceId: newWorkspace.id,
                userId,
                role: 'owner',
            },
        });

        // 3. Auto-create a default BrandProfile placeholder
        await tx.brandProfile.create({
            data: {
                workspaceId: newWorkspace.id,
                brandName: name,   // placeholder — user will fill in during onboarding
                domain: '',
                aliases: [],
                version: 1,
            },
        });

        // 4. Write audit log
        await tx.auditLog.create({
            data: {
                workspaceId: newWorkspace.id,
                eventType: 'workspace.created',
                detailsJson: {
                    userId,
                    changes: { name },
                },
            },
        });

        return newWorkspace;
    });

    return apiSuccess(workspace, 201);
}
