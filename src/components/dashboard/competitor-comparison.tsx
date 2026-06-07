import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ComparisonRow } from '@/lib/dashboard/competitor-comparison';

interface CompetitorComparisonProps {
    rows: ComparisonRow[];
    totalMentions: number;
}

/**
 * Share-of-voice comparison (Requirement 7.3 / 17.4).
 *
 * Horizontal bars showing each entity's share of all mentions in the latest
 * run, brand highlighted. Read-only server component.
 */
export function CompetitorComparison({ rows, totalMentions }: CompetitorComparisonProps) {
    return (
        <Card className="space-y-4 p-5">
            <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Share of voice</h2>
                <span className="text-xs text-slate-500">
                    {totalMentions} mention{totalMentions === 1 ? '' : 's'} · latest run
                </span>
            </div>

            <ul className="space-y-3">
                {rows.map((row) => {
                    const isBrand = row.type === 'brand';
                    return (
                        <li key={row.entityId}>
                            <div className="mb-1 flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2">
                                    <span
                                        className={cn(
                                            'font-medium',
                                            isBrand ? 'text-brand-700' : 'text-slate-700',
                                        )}
                                    >
                                        {row.name}
                                    </span>
                                    {isBrand && <Badge variant="brand">Your brand</Badge>}
                                </span>
                                <span className="tabular-nums text-slate-500">
                                    {row.sharePercent}%{' '}
                                    <span className="text-slate-400">· {row.mentionCount}</span>
                                </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                <div
                                    className={cn(
                                        'h-full rounded-full',
                                        isBrand ? 'bg-brand-gradient' : 'bg-slate-300',
                                    )}
                                    style={{ width: `${row.sharePercent}%` }}
                                />
                            </div>
                        </li>
                    );
                })}
            </ul>
        </Card>
    );
}
