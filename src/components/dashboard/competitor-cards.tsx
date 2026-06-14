import type { CompetitorCard } from '@/lib/dashboard/dashboard-data';

interface CompetitorCardsProps {
    cards: CompetitorCard[];
    brandName: string;
    brandScore: number;
}

/** Comparative score bar: your score vs the competitor's (PRD §F7). */
function CompareBar({ label, score, tone }: { label: string; score: number; tone: 'brand' | 'competitor' }) {
    return (
        <div>
            <div className="mb-1 flex items-center justify-between text-xs">
                <span className="truncate text-slate-500">{label}</span>
                <span className="ml-2 shrink-0 font-semibold tabular-nums text-slate-700">{score}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                    className={`h-full rounded-full ${tone === 'brand' ? 'bg-brand-gradient' : 'bg-slate-400'}`}
                    style={{ width: `${Math.max(2, score)}%` }}
                />
            </div>
        </div>
    );
}

export function CompetitorCards({ cards, brandName, brandScore }: CompetitorCardsProps) {
    if (cards.length === 0) return null;

    return (
        <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Competitor comparison
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
                {cards.map((c) => (
                    <div key={c.competitorId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900">{c.name}</p>
                                <p className="truncate text-xs text-slate-400">{c.domain}</p>
                            </div>
                            <div className="shrink-0 text-right">
                                <span className="text-2xl font-bold tabular-nums text-slate-900">{c.score}</span>
                                <span className="text-sm text-slate-400">/100</span>
                            </div>
                        </div>

                        <div className="mt-4 space-y-2.5">
                            <CompareBar label={`${brandName} (you)`} score={brandScore} tone="brand" />
                            <CompareBar label={c.name} score={c.score} tone="competitor" />
                        </div>

                        <p className="mt-4 text-sm text-slate-500">
                            {c.gapCount > 0 ? (
                                <>
                                    Appears on{' '}
                                    <span className="font-semibold text-slate-900">{c.gapCount}</span>{' '}
                                    {c.gapCount === 1 ? 'response' : 'responses'} where you don&apos;t.
                                </>
                            ) : (
                                <>No responses where they appear and you don&apos;t. </>
                            )}
                        </p>
                    </div>
                ))}
            </div>
        </section>
    );
}
