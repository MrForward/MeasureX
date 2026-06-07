import { OverviewSkeleton } from '@/components/dashboard/overview-skeleton';

/**
 * loading.tsx — Next.js file-convention loading UI.
 *
 * Automatically shown by Next.js as a Suspense fallback while the page's
 * async server components (Overview, workspace lookup) are resolving.
 * Renders a full-page skeleton that matches the populated layout to avoid
 * layout shift.
 */
export default function DashboardLoading() {
    return <OverviewSkeleton />;
}
