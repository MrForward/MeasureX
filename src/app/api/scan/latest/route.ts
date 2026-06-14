/**
 * GET /api/scan/latest — the latest scan as the dashboard view-model (PRD §6/§F7):
 * score overview, prompt rows, and computed competitor cards. Powers the
 * dashboard's initial render and its poll refresh.
 */

import { apiSuccess, apiError } from '@/lib/api/response';
import { getCurrentUser } from '@/lib/api/auth';
import { loadDashboardData } from '@/lib/dashboard/load-dashboard';

export async function GET() {
    const user = await getCurrentUser();
    if (!user) {
        return apiError('Authentication required', 'UNAUTHORIZED', 401);
    }

    const data = await loadDashboardData(user.id);
    if (!data) {
        return apiError('No brand found — complete onboarding first', 'NOT_FOUND', 404);
    }

    return apiSuccess(data);
}
