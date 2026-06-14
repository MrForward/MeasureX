/**
 * GET  /api/brand — the user's brand + competitors + prompts.
 * PUT  /api/brand — update the brand's name and/or domain.
 *
 * One user = one brand (CLAUDE.md). All access is scoped to the signed-in user.
 */

import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api/response';
import { getCurrentUser, getCurrentBrand } from '@/lib/api/auth';
import { brandUpdateSchema } from '@/lib/api/validation';

export async function GET() {
    const user = await getCurrentUser();
    if (!user) {
        return apiError('Authentication required', 'UNAUTHORIZED', 401);
    }

    const brand = await getCurrentBrand(user.id);
    if (!brand) {
        return apiError('No brand found — complete onboarding first', 'NOT_FOUND', 404);
    }

    return apiSuccess({ brand });
}

export async function PUT(req: NextRequest) {
    const user = await getCurrentUser();
    if (!user) {
        return apiError('Authentication required', 'UNAUTHORIZED', 401);
    }

    const existing = await db.brand.findUnique({ where: { userId: user.id } });
    if (!existing) {
        return apiError('No brand found — complete onboarding first', 'NOT_FOUND', 404);
    }

    const body = await req.json().catch(() => null);
    const parsed = brandUpdateSchema.safeParse(body);
    if (!parsed.success) {
        return apiError(parsed.error.issues[0]?.message ?? 'Invalid input', 'VALIDATION_ERROR', 400);
    }

    const brand = await db.brand.update({
        where: { id: existing.id },
        data: parsed.data,
    });

    return apiSuccess({ brand });
}
