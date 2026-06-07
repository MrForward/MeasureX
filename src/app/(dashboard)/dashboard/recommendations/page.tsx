import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/utils';
import { db } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { RecommendationsPanel } from '@/components/dashboard/recommendations-panel';
import { loadRecommendations } from '@/lib/dashboard/recommendations';

export const metadata: Metadata = { title: 'Recommendations — MeasureX' };

interface RecommendationsPageProps {
    searchParams: { workspace?: string };
}

/**
 * Recommendations page — evidence-backed, prioritized suggestions from the
 * latest run (Requirement 8).
 */
export default async function RecommendationsPage({ searchParams }: RecommendationsPageProps) {
    const session = await requireAuth();
    const userId = session.user?.id;
    if (!userId) throw new Error('Authenticated session is missing user id');

    const memberships = await db.workspaceMember.findMany({
        where: { userId, workspace: { deletedAt: null } },
        select: { workspaceId: true },
        orderBy: { createdAt: 'asc' },
    });
    const byId = new Set(memberships.map((m) => m.workspaceId));
    const requested = searchParams.workspace;
    const workspaceId =
        requested && byId.has(requested) ? requested : memberships[0]?.workspaceId ?? null;

    const data = workspaceId ? await loadRecommendations(workspaceId) : { hasData: false, rows: [] };

    return (
        <div className="space-y-8">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                    Recommendations
                </h1>
                <p className="text-sm text-slate-500">
                    Actionable, evidence-backed ways to improve your AI visibility — highest impact first.
                </p>
            </header>

            {data.hasData ? (
                <RecommendationsPanel rows={data.rows} />
            ) : (
                <Card className="p-8 text-center">
                    <p className="text-sm text-slate-500">
                        No recommendations yet. Run a scan — we&apos;ll surface the highest-impact
                        opportunities based on the results.
                    </p>
                </Card>
            )}
        </div>
    );
}
