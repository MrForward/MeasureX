/**
 * POST /api/brand/onboard — create the brand + competitors + prompts in one call
 * and trigger the first scan (PRD §F3 step 4).
 *
 * One user = one brand: returns 409 if the user already onboarded.
 */

import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api/response';
import { getCurrentUser } from '@/lib/api/auth';
import { onboardSchema } from '@/lib/api/validation';
import { startScan } from '@/lib/scan/run-scan';

export async function POST(req: NextRequest) {
    const user = await getCurrentUser();
    if (!user) {
        return apiError('Authentication required', 'UNAUTHORIZED', 401);
    }

    // PRD §F3/§2: an active subscription is required before onboarding.
    if (user.subscriptionStatus !== 'active') {
        return apiError('An active subscription is required to set up your brand.', 'SUBSCRIPTION_INACTIVE', 403);
    }

    const existing = await db.brand.findUnique({
        where: { userId: user.id },
        select: { id: true },
    });
    if (existing) {
        return apiError('Brand already exists for this account', 'CONFLICT', 409);
    }

    const body = await req.json().catch(() => null);
    const parsed = onboardSchema.safeParse(body);
    if (!parsed.success) {
        return apiError(parsed.error.issues[0]?.message ?? 'Invalid input', 'VALIDATION_ERROR', 400);
    }
    const { brand, competitors, prompts } = parsed.data;

    let created;
    try {
        created = await db.brand.create({
            data: {
                userId: user.id,
                name: brand.name,
                domain: brand.domain,
                competitors: { create: competitors },
                prompts: { create: prompts.map((p) => ({ text: p.text, category: p.category })) },
            },
            include: { competitors: true, prompts: true },
        });
    } catch {
        return apiError('Could not create your brand. Please try again.', 'ONBOARD_FAILED', 500);
    }

    // Trigger the first scan (background; onboarding bypasses the manual-scan
    // rate limit). Best-effort — onboarding still succeeds if it can't start.
    let scanId: string | null = null;
    try {
        const started = await startScan(created.id);
        scanId = started.scanId;
    } catch {
        scanId = null;
    }

    return apiSuccess({ brand: created, scanId }, 201);
}
