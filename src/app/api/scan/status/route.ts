/**
 * GET /api/scan/status — current/most-recent scan progress (PRD §F9).
 *
 * The client renders "Running prompt X of Y" from
 * (completedRuns + failedRuns) / totalRuns, where totalRuns = totalPrompts × engines.
 */

import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api/response';
import { getCurrentUser } from '@/lib/api/auth';

/** MVP runs 2 engines per prompt (ChatGPT + Perplexity). */
const ENGINE_COUNT = 2;

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

    const scan = await db.scan.findFirst({
        where: { brandId: brand.id },
        orderBy: { startedAt: 'desc' },
        select: {
            id: true,
            status: true,
            totalPrompts: true,
            completedRuns: true,
            failedRuns: true,
            overallScore: true,
            delta: true,
            startedAt: true,
            completedAt: true,
        },
    });

    if (!scan) {
        return apiSuccess({ scan: null });
    }

    const totalRuns = scan.totalPrompts * ENGINE_COUNT;
    const finishedRuns = scan.completedRuns + scan.failedRuns;

    return apiSuccess({
        scan,
        progress: {
            totalRuns,
            finishedRuns,
            isRunning: scan.status === 'running',
        },
    });
}
