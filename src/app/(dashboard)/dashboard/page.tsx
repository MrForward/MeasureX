import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/api/auth';
import { loadDashboardData } from '@/lib/dashboard/load-dashboard';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

export const metadata: Metadata = { title: 'Dashboard — MeasureX' };

/**
 * Dashboard (PRD §F7). Server-renders the initial view-model for an instant
 * first paint, then hands off to the client for polling, sorting/filtering, and
 * the raw-answer drawer. Auth + onboarding are gated by the (dashboard) layout.
 */
export default async function DashboardPage() {
    const user = await getCurrentUser();
    if (!user) {
        redirect('/login?callbackUrl=/dashboard');
    }

    const data = await loadDashboardData(user.id);
    if (!data) {
        redirect('/onboarding');
    }

    return <DashboardClient initial={data} subscriptionStatus={user.subscriptionStatus} />;
}
