'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { EngineBadge } from './engine-badge';
import type { DashboardCompetitor, PromptRow } from '@/lib/dashboard/dashboard-data';

type EngineFilter = 'all' | 'chatgpt' | 'perplexity';
type StatusFilter = 'all' | 'mentioned' | 'absent' | 'competitor';
type SortKey = 'prompt' | 'position' | 'score';
type SortDir = 'asc' | 'desc';

const CATEGORY_LABEL: Record<string, string> = {
    category: 'Category',
    comparison: 'Comparison',
    buyer_intent: 'Buyer intent',
};

const selectClass =
    'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-600';

function anyCompetitorMentioned(row: PromptRow): boolean {
    return Object.values(row.competitorMentioned).some(Boolean);
}

function Check({ on }: { on: boolean }) {
    return on ? (
        <span className="text-emerald-600" aria-label="yes">✓</span>
    ) : (
        <span className="text-slate-300" aria-label="no">✗</span>
    );
}

export function PromptResultsTable({
    rows,
    competitors,
    onRowClick,
}: {
    rows: PromptRow[];
    competitors: DashboardCompetitor[];
    onRowClick: (runId: string) => void;
}) {
    const [engine, setEngine] = React.useState<EngineFilter>('all');
    const [status, setStatus] = React.useState<StatusFilter>('all');
    const [sortKey, setSortKey] = React.useState<SortKey>('score');
    const [sortDir, setSortDir] = React.useState<SortDir>('desc');

    const filtered = React.useMemo(() => {
        const out = rows.filter((r) => {
            if (engine !== 'all' && r.engine !== engine) return false;
            if (status === 'mentioned') return r.brandMentioned;
            if (status === 'absent') return !r.brandMentioned;
            if (status === 'competitor') return !r.brandMentioned && anyCompetitorMentioned(r);
            return true;
        });

        const dir = sortDir === 'asc' ? 1 : -1;
        const nullsLast = (v: number | null) => (v === null ? Number.POSITIVE_INFINITY : v);
        out.sort((a, b) => {
            if (sortKey === 'prompt') return dir * a.promptText.localeCompare(b.promptText);
            if (sortKey === 'position') {
                // position: lower rank = better, so "asc" shows #1 first.
                return dir * (nullsLast(a.brandPosition) - nullsLast(b.brandPosition));
            }
            // score: nulls (failed) always sink to the bottom regardless of dir.
            const as = a.score === null ? -1 : a.score;
            const bs = b.score === null ? -1 : b.score;
            return dir * (as - bs);
        });
        return out;
    }, [rows, engine, status, sortKey, sortDir]);

    function toggleSort(key: SortKey) {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir(key === 'prompt' || key === 'position' ? 'asc' : 'desc');
        }
    }

    const SortHeader = ({ label, k, className }: { label: string; k: SortKey; className?: string }) => (
        <th className={className} aria-sort={sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
            <button
                type="button"
                onClick={() => toggleSort(k)}
                className="inline-flex items-center gap-1 font-medium uppercase tracking-wide hover:text-slate-700"
            >
                {label}
                <span className="text-slate-400">{sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
            </button>
        </th>
    );

    return (
        <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Prompt results
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor="engine-filter">Filter by engine</label>
                    <select id="engine-filter" className={selectClass} value={engine}
                        onChange={(e) => setEngine(e.target.value as EngineFilter)}>
                        <option value="all">All engines</option>
                        <option value="chatgpt">ChatGPT</option>
                        <option value="perplexity">Perplexity</option>
                    </select>
                    <label className="sr-only" htmlFor="status-filter">Filter by status</label>
                    <select id="status-filter" className={selectClass} value={status}
                        onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                        <option value="all">All results</option>
                        <option value="mentioned">Brand mentioned</option>
                        <option value="absent">Brand absent</option>
                        <option value="competitor">Competitor only</option>
                    </select>
                </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full min-w-[680px] text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                        <tr>
                            <SortHeader label="Prompt" k="prompt" className="px-4 py-3" />
                            <th className="px-4 py-3 font-medium uppercase tracking-wide">Engine</th>
                            <th className="px-4 py-3 text-center font-medium uppercase tracking-wide">You</th>
                            {competitors.map((c) => (
                                <th key={c.id} className="max-w-[8rem] truncate px-4 py-3 text-center font-medium uppercase tracking-wide" title={c.name}>
                                    {c.name}
                                </th>
                            ))}
                            <SortHeader label="Pos" k="position" className="px-4 py-3 text-center" />
                            <SortHeader label="Score" k="score" className="px-4 py-3 text-right" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filtered.map((row) => (
                            <tr
                                key={row.runId}
                                role="button"
                                tabIndex={0}
                                onClick={() => onRowClick(row.runId)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        onRowClick(row.runId);
                                    }
                                }}
                                aria-label={`View response for: ${row.promptText}`}
                                className="cursor-pointer transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
                            >
                                <td className="px-4 py-3">
                                    <span className="line-clamp-1 max-w-md text-slate-900" title={row.promptText}>
                                        {row.promptText}
                                    </span>
                                    <Badge variant="outline" className="mt-1">
                                        {CATEGORY_LABEL[row.category] ?? row.category}
                                    </Badge>
                                </td>
                                <td className="px-4 py-3"><EngineBadge engine={row.engine} /></td>
                                <td className="px-4 py-3 text-center">
                                    {row.status === 'failed' ? (
                                        <span className="text-xs font-medium text-amber-600">failed</span>
                                    ) : (
                                        <Check on={row.brandMentioned} />
                                    )}
                                </td>
                                {competitors.map((c) => (
                                    <td key={c.id} className="px-4 py-3 text-center">
                                        {row.status === 'failed' ? (
                                            <span className="text-slate-300">—</span>
                                        ) : (
                                            <Check on={row.competitorMentioned[c.id] ?? false} />
                                        )}
                                    </td>
                                ))}
                                <td className="px-4 py-3 text-center text-slate-600">
                                    {row.brandPosition ? `#${row.brandPosition}` : '—'}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                                    {row.score === null ? '—' : row.score}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filtered.length === 0 && (
                    <p className="px-4 py-10 text-center text-sm text-slate-500">
                        No prompts match these filters.
                    </p>
                )}
            </div>
            <p className="mt-2 text-xs text-slate-400">
                {filtered.length} of {rows.length} {rows.length === 1 ? 'response' : 'responses'} · click a row to view the full answer
            </p>
        </section>
    );
}
