import * as React from 'react';
import Link from 'next/link';
import { LineChart, Sparkles, Users } from 'lucide-react';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { OverviewCard } from './overview-card';
import { loadOverviewData } from '@/lib/dashboard/overview';

interface OverviewProps {
    workspaceId: string;
}

/**
 * Overview — server component that loads and renders the workspace overview.
 *
 * Two states:
 *   - hasData=false → friendly empty-state card with "Set up first run" CTA
 *   - hasData=true  → 4-card grid (Visibility Score, Mentions, Citation Rate,
 *                     Last Run) plus a "Dive deeper" action row
 *
 * This is a server component — data fetching happens on the server, the client
 * only receives rendered HTML. There are no client hooks here, so no "use client"
 * directive.
 *
 * Validates: Requirement 7.1 (overview panel)
 */
export async function Overview({ workspaceId }: OverviewProps) {
    const data = await loadOverviewData(workspaceId);

    if (!data.hasData) {
        return <OverviewEmptyState totalPrompts={data.totalPrompts} />;
    }

    return (
        <section aria-label="Workspace overview" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <OverviewCard
                    label="Visibility Score"
                    value={data.visibilityScore}
                    unit="/100"
                    change={data.wowChange.visibilityScore}
                />
                <OverviewCard
                    label="Total Mentions"
                    value={data.totalMentions}
                    change={data.wowChange.totalMentions}
                />
                <OverviewCard
                    label="Citation Rate"
                    value={formatPercentValue(data.citationRate)}
                    unit="%"
                    change={data.wowChange.citationRate}
                />
                <OverviewCard
                    label="Last Run"
                    value={formatRelativeTime(data.lastRunAt)}
                />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
                <ActionLink
                    href="/dashboard/prompts"
                    icon={<LineChart className="h-4 w-4" aria-hidden="true" />}
                >
                    View prompts
                </ActionLink>
                <ActionLink
                    href="/dashboard/competitors"
                    icon={<Users className="h-4 w-4" aria-hidden="true" />}
                >
                    View competitors
                </ActionLink>
            </div>
        </section>
    );
}

// ── Empty state ───────────────────────────────────────────────────────────────

/**
 * Friendly card surfaced when the workspace has not produced any metrics yet.
 * Many users will land here on first login — show context and a clear next step
 * rather than an error or blank slate.
 */
function OverviewEmptyState({ totalPrompts }: { totalPrompts: number }) {
    const hasPrompts = totalPrompts > 0;

    return (
        <Card aria-labelledby="overview-empty-title">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700"
                        aria-hidden="true"
                    >
                        <Sparkles className="h-4 w-4" />
                    </span>
                    <CardTitle id="overview-empty-title">No data yet</CardTitle>
                </div>
                <CardDescription>
                    {hasPrompts
                        ? `You have ${totalPrompts} active prompt${totalPrompts === 1 ? '' : 's'}. Trigger a baseline run to populate this dashboard.`
                        : 'Add prompts and run them across AI engines to see your visibility metrics here.'}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-slate-600">
                    Once your first run completes, this page will surface your Visibility
                    Score, total mentions, citation rate, and week-over-week trends.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                    <Link
                        href="/dashboard/prompts"
                        className="inline-flex items-center justify-center rounded-lg bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
                    >
                        {hasPrompts ? 'Start a run' : 'Add your first prompt'}
                    </Link>
                    <Link
                        href="/dashboard/settings"
                        className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
                    >
                        Review brand setup
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface ActionLinkProps {
    href: string;
    icon: React.ReactNode;
    children: React.ReactNode;
}

function ActionLink({ href, icon, children }: ActionLinkProps) {
    return (
        <Link
            href={href}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
        >
            {icon}
            {children}
        </Link>
    );
}

/** Strip a trailing ".0" so a clean integer reads as "50%" not "50.0%". */
function formatPercentValue(rate: number): string {
    if (Number.isInteger(rate)) {
        return rate.toString();
    }
    return rate.toFixed(1);
}

/**
 * Render a Date as a coarse "X minutes/hours/days ago" string.
 *
 * Server components run at request time. To keep the output stable for a given
 * page render we read `Date.now()` once here. We deliberately avoid sub-minute
 * precision so the output isn't sensitive to fractional-second jitter.
 */
function formatRelativeTime(date: Date | null): string {
    if (!date) {
        return 'Never';
    }

    const now = Date.now();
    const then = date.getTime();
    const diffMs = Math.max(0, now - then);
    const minutes = Math.floor(diffMs / 60_000);

    if (minutes < 1) {
        return 'Just now';
    }
    if (minutes < 60) {
        return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h ago`;
    }
    const days = Math.floor(hours / 24);
    if (days < 7) {
        return `${days}d ago`;
    }
    const weeks = Math.floor(days / 7);
    if (weeks < 4) {
        return `${weeks}w ago`;
    }
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
}
