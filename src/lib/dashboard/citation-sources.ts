/**
 * Citation sources data layer.
 *
 * For the latest completed run, groups every extracted citation by domain with
 * a frequency count and its classification (brand / competitor / third-party
 * categories).
 *
 * Validates: Requirement 7.4 (citation sources panel: citations grouped by
 *            domain with frequency counts and classification)
 */

import { db } from '@/lib/db';
import type { Citation, CitationClass } from '@/types';

const COMPLETED_STATUSES = ['completed', 'partial'] as const;

/** One grouped citation source. */
export interface CitationSource {
    domain: string;
    count: number;
    classification: CitationClass;
}

export interface CitationSourcesData {
    hasData: boolean;
    sources: CitationSource[];
    total: number;
}

/**
 * Group citations by domain with frequency counts. Pure — no I/O.
 *
 * Domains are sorted by count descending (then alphabetically for stable order).
 * A domain's classification is taken from its first occurrence — citations to
 * the same domain classify identically, so this is deterministic.
 */
export function aggregateCitations(citations: Citation[]): CitationSource[] {
    const byDomain = new Map<string, CitationSource>();

    for (const c of citations) {
        if (!c.domain) continue;
        const existing = byDomain.get(c.domain);
        if (existing) {
            existing.count += 1;
        } else {
            byDomain.set(c.domain, {
                domain: c.domain,
                count: 1,
                classification: c.classification,
            });
        }
    }

    return Array.from(byDomain.values()).sort(
        (a, b) => b.count - a.count || a.domain.localeCompare(b.domain),
    );
}

/**
 * Load grouped citation sources for the workspace's latest completed run.
 * Read path — always resolves; `hasData: false` when there are no citations.
 */
export async function loadCitationSources(
    workspaceId: string,
): Promise<CitationSourcesData> {
    const empty: CitationSourcesData = { hasData: false, sources: [], total: 0 };

    const latestRun = await db.run.findFirst({
        where: { workspaceId, status: { in: [...COMPLETED_STATUSES] } },
        orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true },
    });
    if (!latestRun) return empty;

    const extractions = await db.extraction.findMany({
        where: { execution: { runId: latestRun.id } },
        select: { citationsJson: true },
    });

    const citations: Citation[] = extractions.flatMap((e) =>
        Array.isArray(e.citationsJson) ? (e.citationsJson as unknown as Citation[]) : [],
    );

    const sources = aggregateCitations(citations);
    const total = sources.reduce((s, c) => s + c.count, 0);

    return { hasData: sources.length > 0, sources, total };
}
