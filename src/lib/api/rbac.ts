/**
 * RBAC middleware helpers for Next.js App Router API routes.
 *
 * Provides composable wrappers that enforce authentication and workspace
 * role-based access control consistently across all API routes.
 *
 * Requirement 1.3: viewer = read-only
 * Requirement 1.4: owner = full CRUD
 * Requirement 1.6: insufficient permissions message
 * Requirement 13.5: RBAC for all workspace operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/utils';
import { db } from '@/lib/db';
import { apiError } from '@/lib/api/response';
import type { Session } from 'next-auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The shape of a WorkspaceMember row returned from the DB (role only). */
export interface MembershipInfo {
    role: string;
}

/** Context injected into workspace-aware route handlers. */
export interface WorkspaceContext {
    session: Session;
    membership: MembershipInfo;
}

/**
 * A plain Next.js App Router route handler.
 * Receives the request and route params, returns a Response.
 */
export type RouteHandler<TParams = Record<string, string>> = (
    request: NextRequest,
    context: { params: TParams },
) => Promise<NextResponse | Response>;

/**
 * A workspace-aware route handler that also receives the resolved session
 * and membership so the handler body doesn't need to re-fetch them.
 */
export type WorkspaceRouteHandler<TParams extends { workspaceId: string } = { workspaceId: string }> = (
    request: NextRequest,
    context: { params: TParams } & WorkspaceContext,
) => Promise<NextResponse | Response>;

// ---------------------------------------------------------------------------
// Role hierarchy
// ---------------------------------------------------------------------------

/**
 * Returns true when `userRole` satisfies `requiredRole`.
 *
 * Role hierarchy: owner > viewer
 * - owner satisfies both 'owner' and 'viewer' requirements
 * - viewer satisfies only 'viewer' requirement
 *
 * @example
 * hasRole('owner', 'viewer') // true
 * hasRole('viewer', 'owner') // false
 * hasRole('owner', 'owner')  // true
 * hasRole('viewer', 'viewer') // true
 */
export function hasRole(userRole: string, requiredRole: 'owner' | 'viewer'): boolean {
    if (requiredRole === 'viewer') {
        // Both owner and viewer satisfy a viewer requirement
        return userRole === 'owner' || userRole === 'viewer';
    }
    // Only owner satisfies an owner requirement
    return userRole === 'owner';
}

// ---------------------------------------------------------------------------
// withAuth
// ---------------------------------------------------------------------------

/**
 * Wraps a route handler and ensures the user is authenticated.
 * Returns 401 if no valid session is found.
 *
 * @example
 * export const GET = withAuth(async (request, context) => {
 *   // session is guaranteed here
 *   return apiSuccess({ ok: true });
 * });
 */
export function withAuth<TParams = Record<string, string>>(
    handler: RouteHandler<TParams>,
): RouteHandler<TParams> {
    return async (request: NextRequest, context: { params: TParams }) => {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return apiError('Authentication required', 'UNAUTHORIZED', 401);
        }
        return handler(request, context);
    };
}

// ---------------------------------------------------------------------------
// withWorkspaceAccess
// ---------------------------------------------------------------------------

/**
 * Wraps a route handler and enforces workspace membership + role checks.
 *
 * - Extracts `workspaceId` from route params
 * - Verifies the workspace exists and is not soft-deleted
 * - Verifies the authenticated user is a member of that workspace
 * - Verifies the user has at least `requiredRole` (defaults to 'viewer')
 * - Injects `{ session, membership }` into the handler context
 *
 * Returns:
 * - 401 if not authenticated
 * - 404 if workspace not found or soft-deleted
 * - 403 if user is not a member or lacks the required role
 *
 * @example
 * export const GET = withWorkspaceAccess(async (request, { params, session, membership }) => {
 *   return apiSuccess({ workspaceId: params.workspaceId, role: membership.role });
 * });
 *
 * export const DELETE = withWorkspaceAccess(async (request, { params, session }) => {
 *   // only owners reach here
 * }, 'owner');
 */
export function withWorkspaceAccess<
    TParams extends { workspaceId: string } = { workspaceId: string },
>(
    handler: WorkspaceRouteHandler<TParams>,
    requiredRole: 'owner' | 'viewer' = 'viewer',
): RouteHandler<TParams> {
    return async (request: NextRequest, context: { params: TParams }) => {
        // 1. Authentication check
        const session = await getServerSession();
        if (!session?.user?.id) {
            return apiError('Authentication required', 'UNAUTHORIZED', 401);
        }

        const { workspaceId } = context.params;
        const userId = session.user.id;

        // 2. Workspace existence check (respects soft-delete)
        const workspace = await db.workspace.findFirst({
            where: { id: workspaceId, deletedAt: null },
            select: { id: true },
        });
        if (!workspace) {
            return apiError('Workspace not found', 'NOT_FOUND', 404);
        }

        // 3. Membership check
        const membership = await db.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId } },
            select: { role: true },
        });
        if (!membership) {
            return apiError(
                'You do not have access to this workspace',
                'FORBIDDEN',
                403,
            );
        }

        // 4. Role check
        if (!hasRole(membership.role, requiredRole)) {
            return apiError(
                'Insufficient permissions',
                'FORBIDDEN',
                403,
            );
        }

        // 5. Delegate to the inner handler with injected context
        return handler(request, { ...context, session, membership });
    };
}
