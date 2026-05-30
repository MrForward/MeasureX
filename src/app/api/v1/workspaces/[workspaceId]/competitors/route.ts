import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api/response';
import { CreateCompetitorSchema } from '@/lib/validations/competitor';
import { withWorkspaceAccess } from '@/lib/api/rbac';
import type { WorkspaceContext } from '@/lib/api/rbac';

type RouteParams = { workspaceId: string };
type RouteContext = { params: RouteParams } & WorkspaceContext;

const MAX_COMPETITORS = 5;

/**
 * GET /api/v1/workspaces/:workspaceId/competitors
 *
 * Returns all active competitors for the workspace, ordered by creation date.
 * Requires viewer role.
 *
 * Requirement 2.2: competitor listing
 * Requirement 13.5: RBAC for all workspace operations
 */
export const GET = withWorkspaceAccess<RouteParams>(
    async (_request: NextRequest, { params }: RouteContext) => {
        const { workspaceId } = params;

        const competitors = await db.competitor.findMany({
            where: { workspaceId, active: true },
            orderBy: { createdAt: 'asc' },
        });

        return apiSuccess(competitors);
    },
    'viewer',
);

/**
 * POST /api/v1/workspaces/:workspaceId/competitors
 *
 * Adds a new competitor to the workspace.
 * Enforces a maximum of 5 active competitors per workspace.
 * Requires owner role.
 * Writes an audit log entry: 'competitor.created'
 *
 * Requirement 2.2: up to 5 competitors per workspace
 * Requirement 2.4: reject addition when limit is reached
 * Requirement 17.1: disambiguation aliases
 * Requirement 19: audit trail
 * Requirement 13.5: RBAC for all workspace operations
 */
export const POST = withWorkspaceAccess<RouteParams>(
    async (request: NextRequest, { params, session }: RouteContext) => {
        const { workspaceId } = params;
        const userId = session.user.id;

        // Parse and validate body
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiError('Invalid JSON body', 'BAD_REQUEST', 400);
        }

        const parsed = CreateCompetitorSchema.safeParse(body);
        if (!parsed.success) {
            const message = parsed.error.errors[0]?.message ?? 'Validation failed';
            return apiError(message, 'VALIDATION_ERROR', 400);
        }

        const { name, domain, aliases } = parsed.data;

        // Enforce max 5 active competitors (Requirement 2.2, 2.4)
        const activeCount = await db.competitor.count({
            where: { workspaceId, active: true },
        });

        if (activeCount >= MAX_COMPETITORS) {
            return apiError(
                'Maximum of 5 competitors allowed per workspace',
                'LIMIT_EXCEEDED',
                409,
            );
        }

        const competitor = await db.$transaction(async (tx) => {
            const created = await tx.competitor.create({
                data: {
                    workspaceId,
                    name,
                    domain,
                    aliases,
                    active: true,
                },
            });

            // Audit log (Requirement 19)
            await tx.auditLog.create({
                data: {
                    workspaceId,
                    eventType: 'competitor.created',
                    detailsJson: {
                        userId,
                        competitorId: created.id,
                        name: created.name,
                        domain: created.domain,
                        aliases: created.aliases,
                    },
                },
            });

            return created;
        });

        return apiSuccess(competitor, 201);
    },
    'owner',
);
