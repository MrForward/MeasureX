import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api/response';
import { withWorkspaceAccess } from '@/lib/api/rbac';
import type { WorkspaceContext } from '@/lib/api/rbac';
import { CreatePromptSchema } from '@/lib/validations/prompt';
import { findSimilarPrompt } from '@/lib/prompts/similarity';
import { config } from '@/lib/config';

type RouteParams = { workspaceId: string };
type RouteContext = { params: RouteParams } & WorkspaceContext;

/**
 * GET /api/v1/workspaces/:workspaceId/prompts
 *
 * Lists all prompts for the workspace (active + archived), newest first, so the
 * management UI can group them. Requires viewer role.
 *
 * Requirement 3 (prompt management), 13.5 (RBAC)
 */
export const GET = withWorkspaceAccess<RouteParams>(
    async (_request: NextRequest, { params }: RouteContext) => {
        const { workspaceId } = params;

        const prompts = await db.prompt.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' },
        });

        return apiSuccess(prompts);
    },
    'viewer',
);

/**
 * POST /api/v1/workspaces/:workspaceId/prompts
 *
 * Creates a prompt. Requires owner role.
 *
 * - Enforces the max-active-prompts limit (Req 3.3, 3.4) from platform config.
 * - Surfaces a NON-BLOCKING duplicate-similarity warning (Req 16.2) — the prompt
 *   is still created; the warning is returned alongside it.
 * - Writes an audit log entry: 'prompt.created'.
 *
 * Response: { prompt, warning } where `warning` is null or a similarity notice.
 *
 * Requirement 3.2, 3.3, 3.7, 16.1, 16.2, 16.4, 19 (audit), 13.5 (RBAC)
 */
export const POST = withWorkspaceAccess<RouteParams>(
    async (request: NextRequest, { params, session }: RouteContext) => {
        const { workspaceId } = params;
        const userId = session.user.id;

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiError('Invalid JSON body', 'BAD_REQUEST', 400);
        }

        const parsed = CreatePromptSchema.safeParse(body);
        if (!parsed.success) {
            const message = parsed.error.errors[0]?.message ?? 'Validation failed';
            return apiError(message, 'VALIDATION_ERROR', 400);
        }

        const { text, intent, topic, geography, language, engines } = parsed.data;

        // ── Max active prompts (Req 3.3, 3.4) ─────────────────────────────────
        const maxActive = await config.get<number>('limits.max_prompts_free', 25);
        const activePrompts = await db.prompt.findMany({
            where: { workspaceId, status: 'active' },
            select: { id: true, text: true },
        });

        if (activePrompts.length >= maxActive) {
            return apiError(
                `Prompt limit reached (${activePrompts.length}/${maxActive}). Archive a prompt before adding another.`,
                'LIMIT_EXCEEDED',
                409,
            );
        }

        // ── Duplicate-similarity warning (Req 16.2) — non-blocking ────────────
        const threshold = await config.get<number>('limits.prompt_similarity_threshold', 0.8);
        const similar = findSimilarPrompt(text, activePrompts, threshold);
        const warning = similar
            ? {
                  code: 'SIMILAR_PROMPT',
                  message: `This prompt is ${Math.round(similar.similarity * 100)}% similar to an existing prompt.`,
                  similarPromptId: similar.id,
              }
            : null;

        const prompt = await db.$transaction(async (tx) => {
            const created = await tx.prompt.create({
                data: {
                    workspaceId,
                    text,
                    intent,
                    topic,
                    geography,
                    language,
                    engines,
                    status: 'active',
                    version: 1,
                },
            });

            await tx.auditLog.create({
                data: {
                    workspaceId,
                    eventType: 'prompt.created',
                    detailsJson: { userId, promptId: created.id, intent, engines },
                },
            });

            return created;
        });

        return apiSuccess({ prompt, warning }, 201);
    },
    'owner',
);
