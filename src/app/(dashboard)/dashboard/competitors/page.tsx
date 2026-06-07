import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { requireAuth } from '@/lib/auth/utils';
import { db } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CompetitorComparison } from '@/components/dashboard/competitor-comparison';
import { loadCompetitorComparison } from '@/lib/dashboard/competitor-comparison';

export const metadata: Metadata = { title: 'Competitors — MeasureX' };

interface CompetitorsPageProps {
    searchParams: { workspace?: string };
}

/**
 * Competitors page — share-of-voice comparison for the latest run, plus the
 * configured competitor list. Editing competitors (add/remove/aliases) is a
 * later task (5.13); for now the list is read-only.
 */
export default async function CompetitorsPage({ searchParams }: CompetitorsPageProps) {
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

    if (!active) {
        return (
            <div className="space-y-8">
                <Header />
                <Card className="p-8 text-center">
                    <p className="text-sm text-slate-500">
                        You aren&apos;t a member of any workspace yet.
                    </p>
                </Card>
            </div>
        );
    }

    const workspaceId = active.workspaceId;
    const [comparison, competitors] = await Promise.all([
        loadCompetitorComparison(workspaceId),
        db.competitor.findMany({
            where: { workspaceId, active: true },
            orderBy: { createdAt: 'asc' },
            select: { id: true, name: true, domain: true },
        }),
    ]);

    return (
        <div className="space-y-8">
            <Header />

            {comparison.hasData ? (
                <CompetitorComparison rows={comparison.rows} totalMentions={comparison.totalMentions} />
            ) : (
                <Card className="p-8 text-center">
                    <p className="text-sm text-slate-500">
                        No mention data yet. Run a scan to see how your share of voice compares.
                    </p>
                </Card>
            )}

            <section className="space-y-3">
                <h2 className="text-sm font-medium text-slate-700">
                    Configured competitors ({competitors.length})
                </h2>
                {competitors.length === 0 ? (
                    <Card className="p-6 text-center">
                        <p className="text-sm text-slate-500">No competitors configured yet.</p>
                    </Card>
                ) : (
                    <ul className="space-y-2">
                        {competitors.map((c) => (
                            <li key={c.id}>
                                <Card className="flex items-center justify-between p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                                            <Users className="h-4 w-4 text-slate-500" aria-hidden="true" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-slate-900">{c.name}</p>
                                            <p className="text-xs text-slate-400">{c.domain}</p>
                                        </div>
                                    </div>
                                    <Badge variant="outline">tracked</Badge>
                                </Card>
                            </li>
                        ))}
                    </ul>
                )}
                <p className="text-xs text-slate-400">
                    Adding and editing competitors from the UI is coming soon.
                </p>
            </section>
        </div>
    );
}

function Header() {
    return (
        <header className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Competitors</h1>
            <p className="text-sm text-slate-500">
                How your brand&apos;s share of voice compares across AI answers.
            </p>
        </header>
    );
}
