import * as React from 'react';
import { Lightbulb } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { BadgeProps } from '@/components/ui/badge';
import type { RecommendationRow } from '@/lib/dashboard/recommendations';
import type { ImpactLevel } from '@/types';

const IMPACT_VARIANT: Record<ImpactLevel, BadgeProps['variant']> = {
    high: 'error',
    medium: 'warning',
    low: 'default',
};

interface RecommendationsPanelProps {
    rows: RecommendationRow[];
    /** When true, render a section heading (used on the dashboard). */
    heading?: boolean;
}

/**
 * Recommendations panel (Requirement 8.2): evidence, action, impact, confidence,
 * ordered by impact. Read-only.
 */
export function RecommendationsPanel({ rows, heading }: RecommendationsPanelProps) {
    return (
        <section aria-label="Recommendations" className="space-y-3">
            {heading && <h2 className="text-sm font-medium text-slate-700">Recommendations</h2>}
            <ul className="space-y-3">
                {rows.map((r) => (
                    <li key={r.id}>
                        <Card className="flex items-start gap-3 p-4">
                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50">
                                <Lightbulb className="h-4 w-4 text-brand-600" aria-hidden="true" />
                            </div>
                            <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant={IMPACT_VARIANT[r.impactLevel]} className="capitalize">
                                        {r.impactLevel} impact
                                    </Badge>
                                    <span className="text-xs text-slate-400">
                                        {Math.round(r.confidence * 100)}% confidence
                                    </span>
                                    {r.promptText && (
                                        <span className="truncate text-xs text-slate-400" title={r.promptText}>
                                            · {r.promptText}
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm font-medium text-slate-900">{r.action}</p>
                                <p className="text-sm text-slate-500">{r.evidenceText}</p>
                            </div>
                        </Card>
                    </li>
                ))}
            </ul>
        </section>
    );
}
