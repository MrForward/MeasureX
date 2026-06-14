'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { ScoreOverview } from './score-overview';
import { PromptResultsTable } from './prompt-results-table';
import { CompetitorCards } from './competitor-cards';
import { RawAnswerDrawer } from './raw-answer-drawer';
import type { DashboardData } from '@/lib/dashboard/dashboard-data';

interface Progress {
    finishedRuns: number;
    totalRuns: number;
    isRunning: boolean;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.error) {
        throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
    }
    return body.data as T;
}

export function DashboardClient({
    initial,
    subscriptionStatus,
}: {
    initial: DashboardData;
    subscriptionStatus: string;
}) {
    const isActive = subscriptionStatus === 'active';
    const [data, setData] = React.useState<DashboardData>(initial);
    const [progress, setProgress] = React.useState<Progress | null>(null);
    const [starting, setStarting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);

    const loadStatus = React.useCallback(async () => {
        const d = await apiFetch<{ progress: Progress | null }>('/api/scan/status');
        setProgress(d.progress);
        return d.progress?.isRunning ?? false;
    }, []);

    const loadLatest = React.useCallback(async () => {
        const d = await apiFetch<DashboardData>('/api/scan/latest');
        setData(d);
    }, []);

    // Detect an in-flight scan on first paint (e.g. arriving from onboarding).
    React.useEffect(() => {
        if (initial.scan?.status === 'running') {
            void loadStatus();
        }
    }, [initial.scan?.status, loadStatus]);

    // Poll while a scan runs, then refresh results once it finishes.
    React.useEffect(() => {
        if (!progress?.isRunning) return;
        const id = setInterval(async () => {
            try {
                const running = await loadStatus();
                if (!running) {
                    clearInterval(id);
                    await loadLatest();
                }
            } catch {
                clearInterval(id);
            }
        }, 2000);
        return () => clearInterval(id);
    }, [progress?.isRunning, loadStatus, loadLatest]);

    async function runScan() {
        if (!isActive) return;
        // PRD §F9 confirmation before a 2-4 minute scan.
        if (!window.confirm('Run a new scan? This checks all your active prompts across ChatGPT and Perplexity and takes about 2–4 minutes.')) {
            return;
        }
        setStarting(true);
        setError(null);
        try {
            await apiFetch('/api/scan/run', { method: 'POST' });
            await loadStatus();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not start scan.');
        } finally {
            setStarting(false);
        }
    }

    const isRunning = progress?.isRunning ?? data.scan?.status === 'running';
    const hasResults = data.rows.length > 0;
    const brandScore = data.scan?.overallScore ?? 0;

    return (
        <div className="space-y-8">
            {error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {!isActive && (
                <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                        Your subscription is{' '}
                        <span className="font-semibold">
                            {subscriptionStatus === 'past_due' ? 'past due' : subscriptionStatus}
                        </span>
                        . Resubscribe to run new scans.
                    </span>
                    <a
                        href="/dashboard/settings"
                        className="shrink-0 rounded-lg bg-brand-gradient px-4 py-2 text-center text-sm font-medium text-white transition hover:opacity-90"
                    >
                        Manage billing
                    </a>
                </div>
            )}

            <ScoreOverview
                scan={data.scan}
                isRunning={isRunning}
                starting={starting}
                canRun={isActive}
                progress={progress}
                onRunScan={runScan}
            />

            {!data.scan && !isRunning ? (
                <EmptyState onRunScan={runScan} starting={starting} />
            ) : (
                <>
                    {hasResults && (
                        <PromptResultsTable
                            rows={data.rows}
                            competitors={data.competitors}
                            onRowClick={setSelectedRunId}
                        />
                    )}
                    <CompetitorCards
                        cards={data.competitorCards}
                        brandName={data.brand.name}
                        brandScore={brandScore}
                    />
                </>
            )}

            <RawAnswerDrawer
                runId={selectedRunId}
                brandName={data.brand.name}
                brandDomain={data.brand.domain}
                competitors={data.competitors}
                onClose={() => setSelectedRunId(null)}
            />
        </div>
    );
}

function EmptyState({ onRunScan, starting }: { onRunScan: () => void; starting: boolean }) {
    return (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
                <span className="h-5 w-5 rounded-md bg-brand-gradient" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">No scan results yet</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                Run your first scan to see how ChatGPT and Perplexity talk about your brand versus your competitors.
            </p>
            <div className="mt-5">
                <Button onClick={onRunScan} disabled={starting} size="lg">
                    {starting ? 'Starting…' : 'Run your first scan'}
                </Button>
            </div>
        </div>
    );
}
