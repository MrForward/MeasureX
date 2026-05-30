import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api/response';
import { CreateBrandProfileSchema } from '@/lib/validations/brand';
import { withWorkspaceAccess } from '@/lib/api/rbac';
import type { WorkspaceContext } from '@/lib/api/rbac';

type RouteParams = { workspaceId: string };
type RouteContext = { params: RouteParams } & WorkspaceContext;

/**
 * GET /api/v1/workspaces/:workspaceId/brand
 *
 * Returns the current (latest version) brand profile for the workspace.
 * Requires viewer role.
 *
 * Returns 404 if no brand profile exists yet.
 *
 * Requirement 2: brand & competitor configuration
 * Requirement 12.2: brand profile versioning
 * Requirement 13.5: RBAC for all workspace operations
 */
export const GET = withWorkspaceAccess<RouteParams>(
    async (_request: NextRequest, { params }: RouteContext) => {
        const { workspaceId } = params;

        const brandProfile = await db.brandProfile.findFirst({
            where: { workspaceId },
            orderBy: { version: 'desc' },
        });

        if (!brandProfile) {
            return apiError('No brand profile found for this workspace', 'NOT_FOUND', 404);
        }

        return apiSuccess(brandProfile);
    },
    'viewer',
);

/**
 * POST /api/v1/workspaces/:workspaceId/brand
 *
 * Creates or updates the brand profile using immutable versioning.
 * - If a brand profile already exists: inserts a NEW record with version + 1
 * - If no brand profile exists: inserts version 1
 *
 * CRITICAL: Never updates an existing record. Always inserts a new version.
 * This preserves the link between historical metrics and the brand profile
 * version that was active at collection time.
 *
 * Requires owner role.
 * Writes an audit log entry: 'brand_profile.updated'
 *
 * Requirement 2.1: brand name, domain, up to 3 aliases
 * Requirement 2.5: domain validation
 * Requirement 12.2: brand profile versioning (data versioning integrity)
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

        const parsed = CreateBrandProfileSchema.safeParse(body);
        if (!parsed.success) {
            const message = parsed.error.errors[0]?.message ?? 'Validation failed';
            return apiError(message, 'VALIDATION_ERROR', 400);
        }

        const { brandName, domain, aliases } = parsed.data;

        // Find the current latest version (if any)
        const currentProfile = await db.brandProfile.findFirst({
            where: { workspaceId },
            orderBy: { version: 'desc' },
        });

        const nextVersion = currentProfile ? currentProfile.version + 1 : 1;

        // Immutable versioning: always INSERT, never UPDATE
        const newProfile = await db.$transaction(async (tx) => {
            const created = await tx.brandProfile.create({
                data: {
                    workspaceId,
                    brandName,
                    domain,
                    aliases,
                    version: nextVersion,
                },
            });

            // Audit log
            await tx.auditLog.create({
                data: {
                    workspaceId,
                    eventType: 'brand_profile.updated',
                    detailsJson: {
                        userId,
                        previousVersion: currentProfile
                            ? {
                                id: currentProfile.id,
                                version: currentProfile.version,
                                brandName: currentProfile.brandName,
                                domain: currentProfile.domain,
                                aliases: currentProfile.aliases,
                            }
                            : null,
                        newVersion: {
                            id: created.id,
                            version: created.version,
                            brandName: created.brandName,
                            domain: created.domain,
                            aliases: created.aliases,
                        },
                    },
                },
            });

            return created;
        });

        return apiSuccess(newProfile, 201);
    },
    'owner',
);
