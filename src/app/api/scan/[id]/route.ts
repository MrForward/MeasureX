/**
 * GET /api/scan/[id] — a specific scan's results with runs + extractions
 * (PRD §6), scoped to the signed-in user's brand.
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

    const scan = await db.scan.findFirst({
        where: { id: params.id, brand: { userId: user.id } },
        include: {
            runs: {
                include: {
                    extraction: true,
                    prompt: { select: { id: true, text: true, category: true } },
                },
                orderBy: { createdAt: 'asc' },
            },
        },
    });

    if (!scan) {
        return apiError('Scan not found', 'NOT_FOUND', 404);
    }

    return apiSuccess({ scan });
}
