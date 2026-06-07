import * as React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PromptBreakdownRow } from '@/lib/dashboard/prompt-breakdown';

const ENGINE_LABELS: Record<string, string> = {
    chatgpt: 'ChatGPT',
    perplexity: 'Perplexity',
    google_ai: 'Google AI',
};

function engineLabel(id: string): string {
    return ENGINE_LABELS[id] ?? id;
}

/** Small horizontal score bar (0-100), filled with the brand gradient. */
function ScoreBar({ score }: { score: number }) {
    const pct = Math.max(0, Math.min(100, score));
    return (
        <div className="flex items-center gap-2">
            <span className="w-8 text-right text-sm font-semibold tabular-nums text-slate-900">
                {pct}
            </span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

interface PromptTableProps {
    rows: PromptBreakdownRow[];
}

/**
 * Prompt-level performance table (Requirement 7.2).
 *
 * One row per prompt for the latest completed run: Visibility_Score, mentions,
 * citation rate, and a per-engine breakdown. Read-only server component.
 */
export function PromptTable({ rows }: PromptTableProps) {
    return (
        <section aria-label="Prompt performance" className="space-y-3">
            <h2 className="text-sm font-medium text-slate-700">Prompt performance</h2>
            <Card className="overflow-hidden p-0">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                                <th className="px-4 py-3 font-medium">Prompt</th>
                                <th className="px-4 py-3 font-medium">Visibility</th>
                                <th className="px-4 py-3 font-medium">Mentions</th>
                                <th className="px-4 py-3 font-medium">Citations</th>
                                <th className="px-4 py-3 font-medium">By engine</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr
                                    key={row.promptId}
                                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60"
                                >
                                    <td className="max-w-xs px-4 py-3">
                                        <p className="truncate font-medium text-slate-900" title={row.text}>
                                            {row.text}
                                        </p>
                                        {row.intent && (
                                            <span className="mt-1 inline-block text-xs capitalize text-slate-400">
                                                {row.intent}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <ScoreBar score={row.visibilityScore} />
                                    </td>
                                    <td className="px-4 py-3 tabular-nums text-slate-700">
                                        {row.totalMentions}
                                    </td>
                                    <td className="px-4 py-3 tabular-nums text-slate-700">
                                        {row.citationRate}%
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap gap-1.5">
                                            {row.engines.map((e) => {
                                                const content = (
                                                    <>
                                                        <span className="text-slate-500">{engineLabel(e.engine)}</span>
                                                        <span className="font-semibold text-slate-900">
                                                            {e.visibilityScore}
                                                        </span>
                                                    </>
                                                );
                                                // Link to the evidence drill-down when we know the source execution.
                                                return e.executionId ? (
                                                    <Link
                                                        key={e.engine}
                                                        href={`/dashboard/evidence/${e.executionId}`}
                                                        className="rounded-full transition-colors hover:bg-slate-50"
                                                        title="View source response"
                                                    >
                                                        <Badge
                                                            variant="outline"
                                                            className="gap-1 tabular-nums hover:border-brand-200"
                                                        >
                                                            {content}
                                                        </Badge>
                                                    </Link>
                                                ) : (
                                                    <Badge key={e.engine} variant="outline" className="gap-1 tabular-nums">
                                                        {content}
                                                    </Badge>
                                                );
                                            })}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </section>
    );
}
