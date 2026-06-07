import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/utils';
import { db } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { loadWorkspaceUsage } from '@/lib/dashboard/usage';

export const metadata: Metadata = { title: 'Settings — MeasureX' };

const ENGINE_LABELS: Record<string, string> = {
    chatgpt: 'ChatGPT',
    perplexity: 'Perplexity',
    google_ai: 'Google AI',
};

interface SettingsPageProps {
    searchParams: { workspace?: string };
}

/**
 * Settings page — currently surfaces API usage & estimated cost (Req 10.1/10.2).
 * Brand/workspace/member configuration UI is a later task (5.13).
 */
export default async function SettingsPage({ searchParams }: SettingsPageProps) {
    const session = await requireAuth();
    const userId = session.user?.id;
    if (!userId) throw new Error('Authenticated session is missing user id');

    const memberships = await db.workspaceMember.findMany({
        where: { userId, workspace: { deletedAt: null } },
        include: { workspace: true },
        orderBy: { createdAt: 'asc' },
    });
    const byId = new Map(memberships.map((m) => [m.workspaceId, m]));
    const requested = searchParams.workspace;
    const active = (requested && byId.get(requested)) || memberships[0] || null;

    const usage = active
        ? await loadWorkspaceUsage(active.workspaceId)
        : { hasData: false, byEngine: [], totalCalls: 0, totalCost: 0 };

    return (
        <div className="space-y-8">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Settings</h1>
                <p className="text-sm text-slate-500">
                    API usage and estimated cost for {active?.workspace.name ?? 'your workspace'}.
                </p>
            </header>

            <section className="space-y-3">
                <h2 className="text-sm font-medium text-slate-700">API usage &amp; cost</h2>
                {!usage.hasData ? (
                    <Card className="p-8 text-center">
                        <p className="text-sm text-slate-500">
                            No usage yet. Run a scan to start tracking engine calls and estimated cost.
                        </p>
                    </Card>
                ) : (
                    <Card className="space-y-4 p-5">
                        <div className="flex items-baseline justify-between">
                            <span className="text-sm text-slate-500">
                                {usage.totalCalls} engine calls
                            </span>
                            <span className="text-2xl font-semibold text-slate-900">
                                ${usage.totalCost.toFixed(2)}
                                <span className="ml-1 text-sm font-normal text-slate-400">est.</span>
                            </span>
                        </div>
                        <ul className="divide-y divide-slate-50">
                            {usage.byEngine.map((e) => (
                                <li key={e.engine} className="flex items-center justify-between py-2.5">
                                    <span className="flex items-center gap-2">
                                        <Badge variant="outline">{ENGINE_LABELS[e.engine] ?? e.engine}</Badge>
                                        <span className="text-sm text-slate-500">{e.callCount} calls</span>
                                    </span>
                                    <span className="text-sm font-medium tabular-nums text-slate-900">
                                        ${e.estimatedCost.toFixed(4)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </Card>
                )}
                <p className="text-xs text-slate-400">
                    Costs are estimates based on per-engine rates. Brand, workspace, and schedule
                    settings are coming soon.
                </p>
            </section>
        </div>
    );
}
