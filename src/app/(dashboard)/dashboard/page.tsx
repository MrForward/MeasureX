import type { Metadata } from 'next';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { requireAuth } from '@/lib/auth/utils';
import { db } from '@/lib/db';
import { Overview } from '@/components/dashboard/overview';

export const metadata: Metadata = {
    title: 'Dashboard — MeasureX',
    description: 'Your MeasureX visibility overview.',
};

interface DashboardPageProps {
    searchParams: { workspace?: string };
}

/**
 * Dashboard home — overview panel.
 *
 * Active workspace selection:
 *   1. Honour the ?workspace=… URL param when the user has access to it.
 *   2. Otherwise default to the user's first workspace.
 *   3. If the user has no workspaces, render the no-workspace empty state.
 *
 * Layered below the overview are placeholders for the prompt-level table
 * (task 5.3) and the competitor comparison (task 5.4) — they're intentionally
 * left as "coming soon" cards so the page renders end-to-end today.
 */
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
    const session = await requireAuth();
    const userId = session.user?.id;
    if (!userId) {
        throw new Error('Authenticated session is missing user id');
    }

    const memberships = await db.workspaceMember.findMany({
        where: { userId, workspace: { deletedAt: null } },
        include: { workspace: true },
        orderBy: { createdAt: 'asc' },
    });

    const accessibleIds = new Set(memberships.map((m) => m.workspaceId));
    const requested = searchParams.workspace;
    const activeWorkspaceId =
        requested && accessibleIds.has(requested)
            ? requested
            : (memberships[0]?.workspaceId ?? null);

    if (!activeWorkspaceId) {
        return <NoWorkspaceState />;
    }

    const activeMembership = memberships.find(
        (m) => m.workspaceId === activeWorkspaceId,
    );
    const workspaceName = activeMembership?.workspace.name ?? 'Workspace';

    return (
        <div className="space-y-8">
            <header className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-brand-700">
                    {workspaceName}
                </p>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                    Dashboard
                </h1>
                <p className="text-sm text-slate-500">
                    Track where your brand shows up across AI answer engines.
                </p>
            </header>

            <Overview workspaceId={activeWorkspaceId} />

            <ComingSoonRow />
        </div>
    );
}

/**
 * Cards for the prompt-level table and competitor comparison views.
 * These are filled in by tasks 5.3 and 5.4 — render placeholders today so the
 * page is visually complete.
 */
function ComingSoonRow() {
    return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>Prompt-level breakdown</CardTitle>
                    <CardDescription>
                        Per-prompt scores, mention counts, and per-engine details.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-slate-500">Coming soon.</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Competitor comparison</CardTitle>
                    <CardDescription>
                        Side-by-side visibility against your tracked competitors.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-slate-500">Coming soon.</p>
                </CardContent>
            </Card>
        </div>
    );
}

function NoWorkspaceState() {
    return (
        <div className="space-y-6">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                    Dashboard
                </h1>
                <p className="text-sm text-slate-500">
                    You aren&apos;t a member of any workspace yet.
                </p>
            </header>
            <Card>
                <CardHeader>
                    <CardTitle>Create your first workspace</CardTitle>
                    <CardDescription>
                        A workspace holds your brand profile, competitors, prompts, and
                        results.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-slate-600">
                        Once you create a workspace and add a brand, run prompts across AI
                        engines to populate this dashboard.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
