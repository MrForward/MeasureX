import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { BadgeProps } from '@/components/ui/badge';
import type { CitationSource } from '@/lib/dashboard/citation-sources';
import type { CitationClass } from '@/types';

/** Map a citation classification to a badge variant + label. */
const CLASS_META: Record<CitationClass, { variant: BadgeProps['variant']; label: string }> = {
    brand: { variant: 'brand', label: 'Your brand' },
    competitor: { variant: 'warning', label: 'Competitor' },
    review_site: { variant: 'default', label: 'Review site' },
    publication: { variant: 'default', label: 'Publication' },
    forum: { variant: 'default', label: 'Forum' },
    other: { variant: 'outline', label: 'Third-party' },
};

interface CitationSourcesPanelProps {
    sources: CitationSource[];
    total: number;
}

/**
 * Citation sources panel (Requirement 7.4) — domains cited across the latest
 * run, grouped with frequency counts and classification. Read-only.
 */
export function CitationSourcesPanel({ sources, total }: CitationSourcesPanelProps) {
    return (
        <section aria-label="Citation sources" className="space-y-3">
            <h2 className="text-sm font-medium text-slate-700">Citation sources</h2>
            <Card className="divide-y divide-slate-50 p-0">
                <div className="flex items-center justify-between px-4 py-3 text-xs text-slate-500">
                    <span>{sources.length} domains</span>
                    <span>{total} citations · latest run</span>
                </div>
                <ul className="divide-y divide-slate-50">
                    {sources.map((s) => {
                        const meta = CLASS_META[s.classification] ?? CLASS_META.other;
                        return (
                            <li
                                key={s.domain}
                                className="flex items-center justify-between gap-3 px-4 py-2.5"
                            >
                                <span className="flex min-w-0 items-center gap-2">
                                    <span className="truncate text-sm text-slate-800">{s.domain}</span>
                                    <Badge variant={meta.variant}>{meta.label}</Badge>
                                </span>
                                <span className="tabular-nums text-sm font-medium text-slate-900">
                                    {s.count}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </Card>
        </section>
    );
}
