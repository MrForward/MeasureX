import * as React from 'react';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { OnboardingWizard } from '@/components/dashboard/onboarding-wizard';
import { PlayCircle, Users, Database } from 'lucide-react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { requireAuth } from '@/lib/auth/utils';
import { db } from '@/lib/db';
import { Overview } from '@/components/dashboard/overview';
import { OverviewSkeleton } from '@/components/dashboard/overview-skeleton';
import { RunScanButton } from '@/components/dashboard/run-scan-button';
import { PromptTable } from '@/components/dashboard/prompt-table';
import { loadPromptBreakdown } from '@/lib/dashboard/prompt-breakdown';
import { CitationSourcesPanel } from '@/components/dashboard/citation-sources';
import { loadCitationSources } from '@/lib/dashboard/citation-sources';
import { RecommendationsPanel } from '@/components/dashboard/recommendations-panel';
import { loadRecommendations } from '@/lib/dashboard/recommendations';

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
 * Quality improvements:
 *   - Suspense boundary wraps the Overview for graceful loading states
 *   - Quick actions replace placeholder "coming soon" cards
 *   - Locale-aware number formatting via shared format utilities
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
    const canRun = activeMembership?.role === 'owner';

    // Un-configured workspace → show onboarding inline. A fresh workspace ships
    // with a placeholder brand profile (empty domain) but no prompts; once any
    // prompt exists the workspace has been set up. Rendering the wizard inline
    // (rather than redirect()) avoids the redirect-vs-error-boundary conflict.
    const promptCount = await db.prompt.count({
        where: { workspaceId: activeWorkspaceId },
    });
    if (promptCount === 0) {
        return (
            <div className="space-y-8">
                <header className="space-y-1 text-center">
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                        Welcome to MeasureX
                    </h1>
                    <p className="text-sm text-slate-500">
                        Let&apos;s set up your brand monitoring — it takes about a minute.
                    </p>
                </header>
                <OnboardingWizard workspaceId={activeWorkspaceId} defaultBrandName={workspaceName} />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-brand-700">
                        {workspaceName}
                    </p>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                        Dashboard
                    </h1>
                    <p className="text-sm text-slate-500">
                        Track where your brand shows up across AI answer engines.
                    </p>
                </div>
                <RunScanButton workspaceId={activeWorkspaceId} canRun={canRun} />
            </header>

            <Suspense fallback={<OverviewCardsSkeleton />}>
                <Overview workspaceId={activeWorkspaceId} />
            </Suspense>

            <Suspense fallback={null}>
                <Recommendations workspaceId={activeWorkspaceId} />
            </Suspense>

            <Suspense fallback={null}>
                <PromptPerformance workspaceId={activeWorkspaceId} />
            </Suspense>

            <Suspense fallback={null}>
                <CitationSources workspaceId={activeWorkspaceId} />
            </Suspense>

            <QuickActions />
        </div>
    );
}

/**
 * Inline skeleton for the Overview Suspense boundary.
 * Lighter than the full-page skeleton — just the 4-card grid.
 */
function OverviewCardsSkeleton() {
    return (
        <section aria-label="Loading overview" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className="p-5">
                        <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
                        <div className="mt-2 flex items-baseline gap-1">
                            <div className="h-8 w-16 animate-pulse rounded bg-slate-100" />
                            <div className="h-4 w-8 animate-pulse rounded bg-slate-100" />
                        </div>
                        <div className="mt-3">
                            <div className="h-5 w-28 animate-pulse rounded-full bg-slate-100" />
                        </div>
                    </Card>
                ))}
            </div>
        </section>
    );
}

/**
 * Prompt-level performance table for the latest completed run.
 * Renders nothing until there's at least one run with metrics (Req 7.2).
 */
async function PromptPerformance({ workspaceId }: { workspaceId: string }) {
    const data = await loadPromptBreakdown(workspaceId);
    if (!data.hasData) {
        return null;
    }
    return <PromptTable rows={data.rows} />;
}

/**
 * Citation sources panel for the latest completed run (Req 7.4).
 * Renders nothing until there are citations to show.
 */
async function CitationSources({ workspaceId }: { workspaceId: string }) {
    const data = await loadCitationSources(workspaceId);
    if (!data.hasData) {
        return null;
    }
    return <CitationSourcesPanel sources={data.sources} total={data.total} />;
}

/**
 * Top recommendations for the latest run (Req 8.2/8.3), highest-impact first.
 * Renders nothing until a run has produced recommendations.
 */
async function Recommendations({ workspaceId }: { workspaceId: string }) {
    const data = await loadRecommendations(workspaceId);
    if (!data.hasData) {
        return null;
    }
    return <RecommendationsPanel rows={data.rows} heading />;
}

/**
 * Quick actions section — actionable links to key workflows.
 * Replaces the previous "coming soon" placeholder cards.
 */
function QuickActions() {
    return (
        <section aria-label="Quick actions">
            <h2 className="mb-3 text-sm font-medium text-slate-700">Quick actions</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <QuickActionCard
                    href="/dashboard/prompts"
                    icon={<PlayCircle className="h-5 w-5 text-brand-600" aria-hidden="true" />}
                    title="Manage prompts"
                    description="Create, edit, and archive the prompts you monitor."
                />
                <QuickActionCard
                    href="/dashboard/competitors"
                    icon={<Users className="h-5 w-5 text-brand-600" aria-hidden="true" />}
                    title="Competitors"
                    description="Compare your visibility against competitors."
                />
                <QuickActionCard
                    href="/dashboard/settings"
                    icon={<Database className="h-5 w-5 text-brand-600" aria-hidden="true" />}
                    title="Settings"
                    description="Brand profile, workspace, and run schedule."
                />
            </div>
        </section>
    );
}

interface QuickActionCardProps {
    href: string;
    icon: React.ReactNode;
    title: string;
    description: string;
}

function QuickActionCard({ href, icon, title, description }: QuickActionCardProps) {
    return (
        <Link href={href} className="group">
            <Card className="flex items-start gap-3 p-4 transition-colors group-hover:border-brand-200 group-hover:bg-slate-50">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                    {icon}
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 group-hover:text-brand-700">
                        {title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{description}</p>
                </div>
            </Card>
        </Link>
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
