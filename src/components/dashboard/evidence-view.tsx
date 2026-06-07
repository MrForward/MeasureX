import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { EvidenceData, EvidenceMention } from '@/lib/dashboard/evidence';
import type { CitationClass } from '@/types';

const ENGINE_LABELS: Record<string, string> = {
    chatgpt: 'ChatGPT',
    perplexity: 'Perplexity',
    google_ai: 'Google AI',
};

const FACTOR_LABELS = {
    mention: 'Mention presence',
    position: 'Mention position',
    recommendation: 'Recommendation strength',
    citation: 'Citation inclusion',
} as const;

const CITATION_CLASS_LABELS: Record<CitationClass, string> = {
    brand: 'Your brand',
    competitor: 'Competitor',
    review_site: 'Review site',
    publication: 'Publication',
    forum: 'Forum',
    other: 'Third-party',
};

/** Split response text into plain + highlighted (mention) spans. */
function highlightMentions(text: string, mentions: EvidenceMention[]): React.ReactNode[] {
    const sorted = mentions
        .filter((m) => m.position >= 0 && m.matchedText && m.position <= text.length)
        .sort((a, b) => a.position - b.position);

    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    let key = 0;

    for (const m of sorted) {
        const start = m.position;
        const end = Math.min(start + m.matchedText.length, text.length);
        if (start < cursor) continue; // overlapping match — skip
        if (start > cursor) nodes.push(<span key={key++}>{text.slice(cursor, start)}</span>);
        nodes.push(
            <mark
                key={key++}
                className={cn(
                    'rounded px-0.5',
                    m.entityType === 'brand'
                        ? 'bg-brand-100 text-brand-800'
                        : 'bg-amber-100 text-amber-800',
                )}
            >
                {text.slice(start, end)}
            </mark>,
        );
        cursor = end;
    }
    if (cursor < text.length) nodes.push(<span key={key++}>{text.slice(cursor)}</span>);
    return nodes;
}

/** A single score factor row with its weighted contribution bar. */
function FactorRow({ label, raw, weighted }: { label: string; raw: number; weighted: number }) {
    return (
        <div className="flex items-center gap-3 py-2">
            <span className="w-40 flex-shrink-0 text-sm text-slate-600">{label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${raw}%` }} />
            </div>
            <span className="w-10 text-right text-xs tabular-nums text-slate-400">{raw}</span>
            <span className="w-14 text-right text-sm font-medium tabular-nums text-slate-900">
                +{weighted.toFixed(1)}
            </span>
        </div>
    );
}

interface EvidenceViewProps {
    data: EvidenceData;
}

/**
 * "View source" evidence page (Req 19.2, 19.4, 7.5): the raw response, the
 * four-factor score breakdown, detected mentions, and classified citations.
 */
export function EvidenceView({ data }: EvidenceViewProps) {
    const engine = ENGINE_LABELS[data.engine] ?? data.engine;
    const f = data.breakdown.factors;

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Back to dashboard
                </Link>
            </div>

            <header className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="brand">{engine}</Badge>
                    {data.intent && <Badge variant="outline" className="capitalize">{data.intent}</Badge>}
                    {data.ambiguous && <Badge variant="warning">ambiguous</Badge>}
                    {data.modelVersion && (
                        <span className="text-xs text-slate-400">{data.modelVersion}</span>
                    )}
                </div>
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                    {data.promptText}
                </h1>
            </header>

            {/* Score breakdown */}
            <Card className="space-y-2 p-5">
                <div className="flex items-baseline justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">Score breakdown</h2>
                    <span className="text-2xl font-semibold text-slate-900">
                        {data.visibilityScore}
                        <span className="text-base font-normal text-slate-400">/100</span>
                    </span>
                </div>
                <div className="divide-y divide-slate-50">
                    <FactorRow label={FACTOR_LABELS.mention} raw={f.mention.raw} weighted={f.mention.weighted} />
                    <FactorRow label={FACTOR_LABELS.position} raw={f.position.raw} weighted={f.position.weighted} />
                    <FactorRow label={FACTOR_LABELS.recommendation} raw={f.recommendation.raw} weighted={f.recommendation.weighted} />
                    <FactorRow label={FACTOR_LABELS.citation} raw={f.citation.raw} weighted={f.citation.weighted} />
                </div>
            </Card>

            {/* Raw response with highlighted mentions */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-medium text-slate-700">Raw response</h2>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-sm bg-brand-100" /> brand
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-sm bg-amber-100" /> competitor
                        </span>
                    </div>
                </div>
                <Card className="p-5">
                    {data.responseText ? (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                            {highlightMentions(data.responseText, data.mentions)}
                        </p>
                    ) : (
                        <p className="text-sm text-slate-400">
                            Raw response text is unavailable for this execution.
                        </p>
                    )}
                </Card>
            </section>

            {/* Citations */}
            {data.citations.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-sm font-medium text-slate-700">
                        Citations ({data.citations.length})
                    </h2>
                    <Card className="divide-y divide-slate-50 p-0">
                        {data.citations.map((c, i) => (
                            <div key={`${c.url}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                                <span className="truncate text-sm text-slate-700">{c.url}</span>
                                <Badge variant={citationVariant(c.classification)}>
                                    {CITATION_CLASS_LABELS[c.classification] ?? 'Third-party'}
                                </Badge>
                            </div>
                        ))}
                    </Card>
                </section>
            )}
        </div>
    );
}

function citationVariant(c: CitationClass): BadgeProps['variant'] {
    if (c === 'brand') return 'brand';
    if (c === 'competitor') return 'warning';
    return 'outline';
}
