import { Button } from '@/components/ui/button';
import type { DashboardScan } from '@/lib/dashboard/dashboard-data';

interface ScoreOverviewProps {
    scan: DashboardScan | null;
    isRunning: boolean;
    starting: boolean;
    canRun?: boolean;
    progress: { finishedRuns: number; totalRuns: number } | null;
    onRunScan: () => void;
}

function DeltaBadge({ delta }: { delta: number | null }) {
    if (delta === null) {
        return <Pill className="bg-slate-100 text-slate-500">First scan</Pill>;
    }
    if (delta === 0) {
        return <Pill className="bg-slate-100 text-slate-500">No change</Pill>;
    }
    const up = delta > 0;
    return (
        <Pill className={up ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
            {up ? '▲' : '▼'} {up ? '+' : ''}{delta}
        </Pill>
    );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
    return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className ?? ''}`}>{children}</span>;
}

export function ScoreOverview({ scan, isRunning, starting, canRun = true, progress, onRunScan }: ScoreOverviewProps) {
    const score = scan?.overallScore ?? 0;
    const hasScore = scan?.overallScore !== null && scan?.overallScore !== undefined;
    const pct = progress && progress.totalRuns > 0
        ? Math.round((progress.finishedRuns / progress.totalRuns) * 100)
        : 0;

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-4">
                    <div>
                        <p className="text-sm font-medium text-slate-500">Visibility score</p>
                        <p className="mt-1 flex items-baseline gap-1 text-slate-900">
                            <span className="text-5xl font-bold tracking-tight tabular-nums">{hasScore ? score : '—'}</span>
                            <span className="text-2xl font-medium text-slate-400">/100</span>
                        </p>
                    </div>
                    {scan && (
                        <div className="self-end pb-2">
                            <DeltaBadge delta={scan.delta} />
                        </div>
                    )}
                </div>

                <div className="flex flex-col items-start gap-2 sm:items-end">
                    <Button onClick={onRunScan} disabled={isRunning || starting || !canRun} size="lg">
                        {isRunning ? 'Scanning…' : starting ? 'Starting…' : 'Run scan'}
                    </Button>
                    {scan?.completedAt && !isRunning && (
                        <span className="text-xs text-slate-400">
                            Last scan{' '}
                            <time suppressHydrationWarning dateTime={scan.completedAt}>
                                {new Date(scan.completedAt).toLocaleString(undefined, {
                                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                                })}
                            </time>
                        </span>
                    )}
                </div>
            </div>

            {/* Live progress while scanning */}
            {isRunning && progress && (
                <div className="mt-5" aria-live="polite">
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700">Scanning across ChatGPT &amp; Perplexity…</span>
                        <span className="tabular-nums text-slate-500">{progress.finishedRuns} of {progress.totalRuns} responses</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                            className="h-full rounded-full bg-brand-gradient transition-[width] duration-500"
                            style={{ width: `${Math.max(4, pct)}%` }}
                            role="progressbar"
                            aria-valuenow={pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                        />
                    </div>
                </div>
            )}

            {/* Per-engine breakdown */}
            {scan?.engineScores && !isRunning && (
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-sm">
                    {Object.entries(scan.engineScores).map(([engine, s]) => (
                        <span key={engine} className="text-slate-500">
                            <span className="capitalize">{engine}</span>:{' '}
                            <span className="font-semibold text-slate-900 tabular-nums">{s}</span>
                            <span className="text-slate-400">/100</span>
                        </span>
                    ))}
                </div>
            )}

            {/* Partial-failure note */}
            {scan?.status === 'partial' && scan.failedRuns > 0 && !isRunning && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                    {scan.completedRuns} of {scan.completedRuns + scan.failedRuns} responses completed; {scan.failedRuns} failed.
                    Results below reflect the completed responses.
                </div>
            )}
        </section>
    );
}
