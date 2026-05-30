import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api/response';
import { UpdateCompetitorSchema } from '@/lib/validations/competitor';
import { withWorkspaceAccess } from '@/lib/api/rbac';
import type { WorkspaceContext } from '@/lib/api/rbac';

type RouteParams = { workspaceId: string; competitorId: string };
type RouteContext = { params: RouteParams } & WorkspaceContext;

/**
 * GET /api/v1/workspaces/:workspaceId/competitors/:competitorId
 *
 * Returns a single competitor by ID.
 * Returns 404 if not found or belongs to a different workspace.
 * Requires viewer role.
 *
 * Requirement 2.2: competitor retrieval
 * Requirement 13.5: RBAC for all workspace operations
 */
export const GET = withWorkspaceAccess<RouteParams>(
    async (_request: NextRequest, { params }: RouteContext) => {
        const { workspaceId, competitorId } = params;

        const competitor = await db.competitor.findFirst({
            where: { id: competitorId, workspaceId },
        });

        if (!competitor) {
            return apiError('Competitor not found', 'NOT_FOUND', 404);
        }

        return apiSuccess(competitor);
    },
    'viewer',
);

/**
 * PATCH /api/v1/workspaces/:workspaceId/competitors/:competitorId
 *
 * Updates a competitor's name, domain, or aliases.
 * Requires owner role.
 * Writes an audit log entry: 'competitor.updated'
 *
 * Requirement 2.2: competitor management
 * Requirement 17.1: disambiguation aliases
 * Requirement 19: audit trail
 * Requirement 13.5: RBAC for all workspace operations
 */
export const PATCH = withWorkspaceAccess<RouteParams>(
    async (request: NextRequest, { params, session }: RouteContext) => {
        const { workspaceId, competitorId } = params;
        const userId = session.user.id;

        // Parse and validate body
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiError('Invalid JSON body', 'BAD_REQUEST', 400);
        }

        const parsed = UpdateCompetitorSchema.safeParse(body);
        if (!parsed.success) {
            const message = parsed.error.errors[0]?.message ?? 'Validation failed';
            return apiError(message, 'VALIDATION_ERROR', 400);
        }

        // Verify competitor exists and belongs to this workspace
        const existing = await db.competitor.findFirst({
            where: { id: competitorId, workspaceId },
        });

        if (!existing) {
            return apiError('Competitor not found', 'NOT_FOUND', 404);
        }

        const updateData = parsed.data;

        const updated = await db.$transaction(async (tx) => {
            const competitor = await tx.competitor.update({
                where: { id: competitorId },
                data: updateData,
            });

            // Audit log (Requirement 19)
            await tx.auditLog.create({
                data: {
                    workspaceId,
                    eventType: 'competitor.updated',
                    detailsJson: {
                        userId,
                        competitorId,
                        changes: updateData,
                        previous: {
                            name: existing.name,
                            domain: existing.domain,
                            aliases: existing.aliases,
                        },
                    },
                },
            });

            return competitor;
        });

        return apiSuccess(updated);
    },
    'owner',
);

/**
 * DELETE /api/v1/workspaces/:workspaceId/competitors/:competitorId
 *
 * Soft-deactivates a competitor by setting active=false.
 * Never hard-deletes — historical data must be preserved.
 * Requires owner role.
 * Writes an audit log entry: 'competitor.deactivated'
 *
 * Requirement 2.6: retain historical data when competitor is removed
 * Requirement 19: audit trail
 * Requirement 13.5: RBAC for all workspace operations
 */
export const DELETE = withWorkspaceAccess<RouteParams>(
    async (_request: NextRequest, { params, session }: RouteContext) => {
        const { workspaceId, competitorId } = params;
        const userId = session.user.id;

        // Verify competitor exists and belongs to this workspace
        const existing = await db.competitor.findFirst({
            where: { id: competitorId, workspaceId },
        });

        if (!existing) {
            return apiError('Competitor not found', 'NOT_FOUND', 404);
        }

        await db.$transaction(async (tx) => {
            // Soft-delete: set active=false, never hard-delete (Requirement 2.6)
            await tx.competitor.update({
                where: { id: competitorId },
                data: { active: false },
            });

            // Audit log (Requirement 19)
            await tx.auditLog.create({
                data: {
                    workspaceId,
                    eventType: 'competitor.deactivated',
                    detailsJson: {
                        userId,
                        competitorId,
                        name: existing.name,
                        domain: existing.domain,
                    },
                },
            });
        });

        return new Response(null, { status: 204 });
    },
    'owner',
);
