/**
 * GET  /api/prompts — list the user's prompts.
 * POST /api/prompts — add a prompt (counts toward the 20-prompt cap, PRD §F3).
 */

import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api/response';
import { getCurrentUser } from '@/lib/api/auth';
import { promptCreateSchema } from '@/lib/api/validation';

/** PRD §F3: a brand may have at most 20 prompts. */
const MAX_PROMPTS = 20;

export async function GET() {
    const user = await getCurrentUser();
    if (!user) {
        return apiError('Authentication required', 'UNAUTHORIZED', 401);
    }

    const brand = await db.brand.findUnique({
        where: { userId: user.id },
        select: { id: true },
    });
    if (!brand) {
        return apiError('No brand found — complete onboarding first', 'NOT_FOUND', 404);
    }

    const prompts = await db.prompt.findMany({
        where: { brandId: brand.id },
        orderBy: { createdAt: 'asc' },
    });

    return apiSuccess({ prompts });
}

export async function POST(req: NextRequest) {
    const user = await getCurrentUser();
    if (!user) {
        return apiError('Authentication required', 'UNAUTHORIZED', 401);
    }

    const brand = await db.brand.findUnique({
        where: { userId: user.id },
        select: { id: true },
    });
    if (!brand) {
        return apiError('No brand found — complete onboarding first', 'NOT_FOUND', 404);
    }

    const body = await req.json().catch(() => null);
    const parsed = promptCreateSchema.safeParse(body);
    if (!parsed.success) {
        return apiError(parsed.error.issues[0]?.message ?? 'Invalid input', 'VALIDATION_ERROR', 400);
    }

    const count = await db.prompt.count({ where: { brandId: brand.id } });
    if (count >= MAX_PROMPTS) {
        return apiError(`Prompt limit reached (max ${MAX_PROMPTS})`, 'LIMIT_REACHED', 409);
    }

    const prompt = await db.prompt.create({
        data: { brandId: brand.id, text: parsed.data.text, category: parsed.data.category },
    });

    return apiSuccess({ prompt }, 201);
}
