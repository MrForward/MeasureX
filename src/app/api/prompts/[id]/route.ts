/**
 * PUT    /api/prompts/[id] — edit a prompt's text / category / active flag.
 * DELETE /api/prompts/[id] — delete a prompt.
 *
 * Scoped to the signed-in user's brand (a user can only touch their own prompts).
 */

import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api/response';
import { getCurrentUser } from '@/lib/api/auth';
import { promptUpdateSchema } from '@/lib/api/validation';

/** Resolve a prompt only if it belongs to the user's brand. */
async function findOwnedPrompt(userId: string, promptId: string) {
    return db.prompt.findFirst({
        where: { id: promptId, brand: { userId } },
        select: { id: true },
    });
}

export async function PUT(
    req: NextRequest,
    { params }: { params: { id: string } },
) {
    const user = await getCurrentUser();
    if (!user) {
        return apiError('Authentication required', 'UNAUTHORIZED', 401);
    }

    const owned = await findOwnedPrompt(user.id, params.id);
    if (!owned) {
        return apiError('Prompt not found', 'NOT_FOUND', 404);
    }

    const body = await req.json().catch(() => null);
    const parsed = promptUpdateSchema.safeParse(body);
    if (!parsed.success) {
        return apiError(parsed.error.issues[0]?.message ?? 'Invalid input', 'VALIDATION_ERROR', 400);
    }

    const prompt = await db.prompt.update({
        where: { id: params.id },
        data: parsed.data,
    });

    return apiSuccess({ prompt });
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: { id: string } },
) {
    const user = await getCurrentUser();
    if (!user) {
        return apiError('Authentication required', 'UNAUTHORIZED', 401);
    }

    const owned = await findOwnedPrompt(user.id, params.id);
    if (!owned) {
        return apiError('Prompt not found', 'NOT_FOUND', 404);
    }

    // A prompt that has been scanned has EngineRun children (and the PRD schema's
    // relation has no cascade). Deleting it would orphan scan evidence, so block
    // it and steer the user to deactivate instead (PUT { active: false }).
    const runCount = await db.engineRun.count({ where: { promptId: params.id } });
    if (runCount > 0) {
        return apiError(
            'This prompt has scan history. Deactivate it instead of deleting.',
            'PROMPT_HAS_HISTORY',
            409,
        );
    }

    await db.prompt.delete({ where: { id: params.id } });

    return apiSuccess({ id: params.id });
}
