/**
 * GET /api/run/[id] — a specific engine run + its raw response and extraction
 * (PRD §6, powers the raw answer viewer F8). Scoped to the user's brand.
 */

import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api/response';
import { getCurrentUser } from '@/lib/api/auth';

export async function GET(
    _req: NextRequest,
    { params }: { params: { id: string } },
) {
    const user = await getCurrentUser();
    if (!user) {
        return apiError('Authentication required', 'UNAUTHORIZED', 401);
    }

    const run = await db.engineRun.findFirst({
        where: { id: params.id, scan: { brand: { userId: user.id } } },
        include: {
            extraction: true,
            prompt: { select: { id: true, text: true, category: true } },
            scan: { select: { id: true, startedAt: true } },
        },
    });

    if (!run) {
        return apiError('Run not found', 'NOT_FOUND', 404);
    }

    return apiSuccess({ run });
}
