import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api/response';
import { withWorkspaceAccess } from '@/lib/api/rbac';
import type { WorkspaceContext } from '@/lib/api/rbac';
import { UpdatePromptSchema } from '@/lib/validations/prompt';

type RouteParams = { workspaceId: string; promptId: string };
type RouteContext = { params: RouteParams } & WorkspaceContext;

/**
 * PATCH /api/v1/workspaces/:workspaceId/prompts/:promptId
 *
 * Updates a prompt. Requires owner role.
 *
 * Edit semantics (Req 3.6 / 12.3): changing the prompt TEXT creates a NEW
 * version (a new row linked via parentPromptId) and archives the original,
 * preserving the original's historical data. Editing other fields (intent,
 * engines, topic, status…) updates in place.
 *
 * Requirement 3.5 (archive via status), 3.6 (edit text = new version),
 * 19 (audit), 13.5 (RBAC)
 */
export const PATCH = withWorkspaceAccess<RouteParams>(
    async (request: NextRequest, { params, session }: RouteContext) => {
        const { workspaceId, promptId } = params;
        const userId = session.user.id;

        const current = await db.prompt.findFirst({
            where: { id: promptId, workspaceId },
        });
        if (!current) {
            return apiError('Prompt not found', 'NOT_FOUND', 404);
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiError('Invalid JSON body', 'BAD_REQUEST', 400);
        }

        const parsed = UpdatePromptSchema.safeParse(body);
        if (!parsed.success) {
            const message = parsed.error.errors[0]?.message ?? 'Validation failed';
            return apiError(message, 'VALIDATION_ERROR', 400);
        }

        const updates = parsed.data;
        const textChanged = updates.text !== undefined && updates.text !== current.text;

        // ── Text edit → new version (Req 3.6) ─────────────────────────────────
        if (textChanged) {
            const newPrompt = await db.$transaction(async (tx) => {
                // Archive the original, preserving its data.
                await tx.prompt.update({
                    where: { id: current.id },
                    data: { status: 'archived', archivedAt: new Date() },
                });

                // Create the next version, carrying forward unchanged fields.
                const created = await tx.prompt.create({
                    data: {
                        workspaceId,
                        text: updates.text!,
                        intent: updates.intent ?? current.intent,
                        topic: updates.topic ?? current.topic,
                        geography: updates.geography ?? current.geography,
                        language: updates.language ?? current.language,
                        engines: updates.engines ?? current.engines,
                        status: 'active',
                        version: current.version + 1,
                        // Lineage root: keep pointing at the original ancestor.
                        parentPromptId: current.parentPromptId ?? current.id,
                    },
                });

                await tx.auditLog.create({
                    data: {
                        workspaceId,
                        eventType: 'prompt.versioned',
                        detailsJson: {
                            userId,
                            fromPromptId: current.id,
                            toPromptId: created.id,
                            version: created.version,
                        },
                    },
                });

                return created;
            });

            return apiSuccess(newPrompt);
        }

        // ── In-place update (no text change) ──────────────────────────────────
        const data: Record<string, unknown> = {};
        if (updates.intent !== undefined) data.intent = updates.intent;
        if (updates.topic !== undefined) data.topic = updates.topic;
        if (updates.geography !== undefined) data.geography = updates.geography;
        if (updates.language !== undefined) data.language = updates.language;
        if (updates.engines !== undefined) data.engines = updates.engines;
        if (updates.status !== undefined) {
            data.status = updates.status;
            data.archivedAt = updates.status === 'archived' ? new Date() : null;
        }

        const updated = await db.$transaction(async (tx) => {
            const result = await tx.prompt.update({
                where: { id: current.id },
                data,
            });
            await tx.auditLog.create({
                data: {
                    workspaceId,
                    eventType: 'prompt.updated',
                    detailsJson: { userId, promptId: current.id, fields: Object.keys(data) },
                },
            });
            return result;
        });

        return apiSuccess(updated);
    },
    'owner',
);

/**
 * DELETE /api/v1/workspaces/:workspaceId/prompts/:promptId
 *
 * Archives a prompt (soft delete — excluded from future runs, data retained).
 * Requires owner role. Req 3.5, 12.3, 19 (audit), 13.5 (RBAC).
 */
export const DELETE = withWorkspaceAccess<RouteParams>(
    async (_request: NextRequest, { params, session }: RouteContext) => {
        const { workspaceId, promptId } = params;
        const userId = session.user.id;

        const current = await db.prompt.findFirst({
            where: { id: promptId, workspaceId },
            select: { id: true, status: true },
        });
        if (!current) {
            return apiError('Prompt not found', 'NOT_FOUND', 404);
        }

        if (current.status === 'archived') {
            return apiSuccess({ id: current.id, status: 'archived' });
        }

        await db.$transaction(async (tx) => {
            await tx.prompt.update({
                where: { id: current.id },
                data: { status: 'archived', archivedAt: new Date() },
            });
            await tx.auditLog.create({
                data: {
                    workspaceId,
                    eventType: 'prompt.archived',
                    detailsJson: { userId, promptId: current.id },
                },
            });
        });

        return apiSuccess({ id: current.id, status: 'archived' });
    },
    'owner',
);
