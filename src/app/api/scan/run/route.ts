/**
 * POST /api/scan/run — trigger a new scan (PRD §F9).
 *
 * Guard rails: active subscription, no scan already running, max 1 scan/hour.
 * Returns 202 with the scan id; the scan runs in the background (poll
 * /api/scan/status for progress).
 */

import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api/response';
import { getCurrentUser } from '@/lib/api/auth';
import { evaluateScanEligibility, type ScanBlockCode } from '@/lib/scan/eligibility';
import { startScan } from '@/lib/scan/run-scan';

const HTTP_STATUS_BY_CODE: Record<ScanBlockCode, number> = {
    SUBSCRIPTION_INACTIVE: 403,
    SCAN_IN_PROGRESS: 409,
    RATE_LIMITED: 429,
};

export async function POST() {
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

    const [running, last] = await Promise.all([
        db.scan.findFirst({ where: { brandId: brand.id, status: 'running' }, select: { id: true } }),
        db.scan.findFirst({
            where: { brandId: brand.id },
            orderBy: { startedAt: 'desc' },
            select: { startedAt: true },
        }),
    ]);

    const eligibility = evaluateScanEligibility({
        subscriptionStatus: user.subscriptionStatus,
        hasRunningScan: running !== null,
        lastScanStartedAt: last?.startedAt ?? null,
        now: new Date(),
    });

    if (!eligibility.allowed && eligibility.code) {
        return apiError(
            eligibility.message ?? 'Scan not allowed',
            eligibility.code,
            HTTP_STATUS_BY_CODE[eligibility.code],
        );
    }

    const started = await startScan(brand.id);
    return apiSuccess(started, 202);
}
