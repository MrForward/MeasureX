/**
 * Loads the dashboard view-model for a user (DB → {@link buildDashboardData}).
 * Shared by the server page (initial render) and `/api/scan/latest` (poll
 * refresh) so both produce the identical shape.
 */

import { db } from '@/lib/db';
import { buildDashboardData, type DashboardData, type RawScan } from './dashboard-data';

/** Returns the dashboard data, or null when the user has no brand (not onboarded). */
export async function loadDashboardData(userId: string): Promise<DashboardData | null> {
    const brand = await db.brand.findUnique({
        where: { userId },
        include: { competitors: { orderBy: { createdAt: 'asc' } } },
    });
    if (!brand) {
        return null;
    }

    const scan = await db.scan.findFirst({
        where: { brandId: brand.id },
        orderBy: { startedAt: 'desc' },
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

    return buildDashboardData(
        scan as unknown as RawScan | null,
        { name: brand.name, domain: brand.domain },
        brand.competitors.map((c) => ({ id: c.id, name: c.name, domain: c.domain })),
    );
}
