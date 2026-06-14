'use client';

import * as React from 'react';
import { EngineBadge } from './engine-badge';
import { segmentResponse } from '@/lib/dashboard/highlight';
import type { DashboardCompetitor } from '@/lib/dashboard/dashboard-data';
import type { CitationResult, CompetitorResult } from '@/lib/extraction/types';

interface RunDetail {
    id: string;
    engine: string;
    model: string;
    status: string;
    rawResponse: string | null;
    errorMessage: string | null;
    createdAt: string;
    prompt: { id: string; text: string; category: string };
    extraction: {
        brandMentioned: boolean;
        brandPosition: number | null;
        brandRecommendation: string;
        competitorResults: CompetitorResult[];
        citations: CitationResult[];
    } | null;
}

const CLASSIFICATION: Record<string, { label: string; className: string }> = {
    owned: { label: 'Your site', className: 'bg-emerald-100 text-emerald-700' },
    competitor: { label: 'Competitor', className: 'bg-amber-100 text-amber-700' },
    review_site: { label: 'Review site', className: 'bg-blue-100 text-blue-700' },
    publication: { label: 'Publication', className: 'bg-violet-100 text-violet-700' },
    forum: { label: 'Forum', className: 'bg-slate-100 text-slate-600' },
    other: { label: 'Other', className: 'bg-slate-100 text-slate-600' },
};

const RECOMMENDATION: Record<string, { label: string; className: string }> = {
    RECOMMENDED: { label: 'Recommended', className: 'text-emerald-700' },
    MENTIONED: { label: 'Mentioned', className: 'text-slate-700' },
    ABSENT: { label: 'Absent', className: 'text-slate-400' },
};

async function fetchRun(runId: string): Promise<RunDetail> {
    const res = await fetch(`/api/run/${runId}`);
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.error) {
        throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
    }
    return body.data.run as RunDetail;
}

function HighlightedResponse({
    text,
    brandTerms,
    competitorTerms,
}: {
    text: string;
    brandTerms: string[];
    competitorTerms: string[];
}) {
    const segments = React.useMemo(
        () => segmentResponse(text, brandTerms, competitorTerms),
        [text, brandTerms, competitorTerms],
    );
    return (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {segments.map((seg, i) => {
                if (seg.kind === 'brand') {
                    return <mark key={i} className="rounded bg-emerald-100 px-0.5 text-emerald-900">{seg.text}</mark>;
                }
                if (seg.kind === 'competitor') {
                    return <mark key={i} className="rounded bg-amber-100 px-0.5 text-amber-900">{seg.text}</mark>;
                }
                if (seg.kind === 'url') {
                    return (
                        <a key={i} href={seg.text} target="_blank" rel="noreferrer"
                            className="text-brand-600 underline decoration-brand-300 underline-offset-2 hover:text-brand-700">
                            {seg.text}
                        </a>
                    );
                }
                return <React.Fragment key={i}>{seg.text}</React.Fragment>;
            })}
        </p>
    );
}

export function RawAnswerDrawer({
    runId,
    brandName,
    brandDomain,
    competitors,
    onClose,
}: {
    runId: string | null;
    brandName: string;
    brandDomain: string;
    competitors: DashboardCompetitor[];
    onClose: () => void;
}) {
    const open = runId !== null;
    const [run, setRun] = React.useState<RunDetail | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const closeRef = React.useRef<HTMLButtonElement>(null);

    // Fetch the run whenever the drawer opens for a new run.
    React.useEffect(() => {
        if (!runId) return;
        let active = true;
        setRun(null);
        setError(null);
        setLoading(true);
        fetchRun(runId)
            .then((r) => active && setRun(r))
            .catch((e) => active && setError(e instanceof Error ? e.message : 'Failed to load.'))
            .finally(() => active && setLoading(false));
        return () => { active = false; };
    }, [runId]);

    // Escape to close, lock body scroll, focus the close button on open.
    React.useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus();
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [open, onClose]);

    if (!open) return null;

    const competitorTerms = competitors.flatMap((c) => [c.name, c.domain]);
    const ext = run?.extraction;
    const mentionedCompetitors = ext
        ? ext.competitorResults
              .filter((cr) => cr.mentioned)
              .map((cr) => competitors.find((c) => c.id === cr.competitorId)?.name)
              .filter((n): n is string => Boolean(n))
        : [];
    const rec = ext ? RECOMMENDATION[ext.brandRecommendation] ?? RECOMMENDATION.ABSENT : null;

    return (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
            {/* Backdrop */}
            <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="absolute inset-0 cursor-default bg-slate-900/40 backdrop-blur-[1px]"
            />
            {/* Panel */}
            <div className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-2xl">
                <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                    <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-3 text-xs text-slate-400">
                            {run && <EngineBadge engine={run.engine} />}
                            {run && <span>{new Date(run.createdAt).toLocaleString()}</span>}
                        </div>
                        <h2 id="drawer-title" className="text-base font-semibold leading-snug text-slate-900">
                            {run?.prompt.text ?? 'Loading…'}
                        </h2>
                    </div>
                    <button
                        ref={closeRef}
                        type="button"
                        onClick={onClose}
                        className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                        aria-label="Close"
                    >
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                        </svg>
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                    {loading && <p className="py-10 text-center text-sm text-slate-500">Loading response…</p>}
                    {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
                    )}

                    {run && !loading && (
                        <div className="space-y-6">
                            {/* Status summary */}
                            {ext && rec && (
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-4 py-3 text-sm">
                                    <span className="text-slate-500">
                                        Your brand: <span className={`font-semibold ${rec.className}`}>{rec.label}</span>
                                    </span>
                                    <span className="text-slate-500">
                                        Position: <span className="font-semibold text-slate-700">{ext.brandPosition ? `#${ext.brandPosition}` : '—'}</span>
                                    </span>
                                    <span className="text-slate-500">
                                        Competitors: <span className="font-semibold text-slate-700">
                                            {mentionedCompetitors.length ? mentionedCompetitors.join(', ') : 'none'}
                                        </span>
                                    </span>
                                </div>
                            )}

                            {/* Response body */}
                            <div>
                                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Response</h3>
                                {run.status === 'failed' ? (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                        This response failed to generate{run.errorMessage ? `: ${run.errorMessage}` : '.'}
                                    </div>
                                ) : run.rawResponse ? (
                                    <HighlightedResponse text={run.rawResponse} brandTerms={[brandName, brandDomain]} competitorTerms={competitorTerms} />
                                ) : (
                                    <p className="text-sm text-slate-400">No response text.</p>
                                )}
                            </div>

                            {/* Citations */}
                            {ext && ext.citations.length > 0 && (
                                <div>
                                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                                        Citations ({ext.citations.length})
                                    </h3>
                                    <ul className="space-y-2">
                                        {ext.citations.map((c, i) => {
                                            const cls = CLASSIFICATION[c.classification] ?? CLASSIFICATION.other;
                                            return (
                                                <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                                                    <a href={c.url} target="_blank" rel="noreferrer"
                                                        className="min-w-0 truncate text-sm text-brand-600 hover:underline" title={c.url}>
                                                        {c.domain}
                                                    </a>
                                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cls.className}`}>
                                                        {c.classification === 'competitor' && c.competitorName ? c.competitorName : cls.label}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
