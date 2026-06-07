/**
 * Competitor comparison data layer.
 *
 * For the latest completed run, aggregates every detected mention (from each
 * extraction's mentionsJson) by entity, then computes share of voice for the
 * brand and each configured competitor.
 *
 * Validates: Requirement 7.3 (competitor comparison view), 17.4 (share of voice
 *            = brand's mention % relative to all configured competitors)
 */

import { db } from '@/lib/db';
import {
    computeShareOfVoice,
    type EntityMentionCount,
} from '@/lib/metrics/share-of-voice';

const COMPLETED_STATUSES = ['completed', 'partial'] as const;

/** A persisted mention as stored in Extraction.mentionsJson. */
export interface MentionLike {
    entityId: string;
    entityType: string;
}

/** An entity with a display name (brand or competitor). */
export interface NamedEntity {
    id: string;
    name: string;
}

/** One row of the comparison: an entity with its mentions and share. */
export interface ComparisonRow {
    entityId: string;
    type: 'brand' | 'competitor';
    name: string;
    mentionCount: number;
    sharePercent: number;
}

export interface CompetitorComparisonData {
    hasData: boolean;
    rows: ComparisonRow[];
    totalMentions: number;
}

/**
 * Count mentions per entity from a flat list of mentions. Pure — no I/O.
 *
 * Returns one entry per configured entity (brand first, then competitors) so
 * entities with zero mentions still appear in the comparison. Mentions whose
 * entityId matches no configured entity are ignored.
 */
export function aggregateEntityMentions(
    mentions: MentionLike[],
    brand: NamedEntity,
    competitors: NamedEntity[],
): EntityMentionCount[] {
    const counts = new Map<string, number>();
    counts.set(brand.id, 0);
    for (const c of competitors) counts.set(c.id, 0);

    for (const m of mentions) {
        if (counts.has(m.entityId)) {
            counts.set(m.entityId, (counts.get(m.entityId) ?? 0) + 1);
        }
    }

    return [
        { entityId: brand.id, entityType: 'brand', mentionCount: counts.get(brand.id) ?? 0 },
        ...competitors.map((c) => ({
            entityId: c.id,
            entityType: 'competitor' as const,
            mentionCount: counts.get(c.id) ?? 0,
        })),
    ];
}

/**
 * Build display rows (with names + share of voice) from mention counts.
 * Pure — combines the share-of-voice computation with entity names and sorts by
 * mentions descending so the loudest voice is first.
 */
export function buildComparisonRows(
    counts: EntityMentionCount[],
    nameById: Map<string, string>,
): ComparisonRow[] {
    const shares = computeShareOfVoice(counts);
    return shares
        .map((s) => ({
            entityId: s.entityId,
            type: s.entityType,
            name: nameById.get(s.entityId) ?? 'Unknown',
            mentionCount: s.mentionCount,
            sharePercent: s.sharePercent,
        }))
        .sort((a, b) => b.mentionCount - a.mentionCount);
}

/**
 * Load the competitor comparison for the workspace's latest completed run.
 * Read path — always resolves; `hasData: false` when there's no run, no brand,
 * or no mentions yet.
 */
export async function loadCompetitorComparison(
    workspaceId: string,
): Promise<CompetitorComparisonData> {
    const empty: CompetitorComparisonData = { hasData: false, rows: [], totalMentions: 0 };

    const [latestRun, brandProfile, competitors] = await Promise.all([
        db.run.findFirst({
            where: { workspaceId, status: { in: [...COMPLETED_STATUSES] } },
            orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
            select: { id: true },
        }),
        db.brandProfile.findFirst({
            where: { workspaceId },
            orderBy: { version: 'desc' },
            select: { id: true, brandName: true },
        }),
        db.competitor.findMany({
            where: { workspaceId, active: true },
            select: { id: true, name: true },
        }),
    ]);

    if (!latestRun || !brandProfile) {
        return empty;
    }

    const extractions = await db.extraction.findMany({
        where: { execution: { runId: latestRun.id } },
        select: { mentionsJson: true },
    });

    const mentions: MentionLike[] = extractions.flatMap((e) =>
        Array.isArray(e.mentionsJson) ? (e.mentionsJson as unknown as MentionLike[]) : [],
    );

    const brand: NamedEntity = { id: brandProfile.id, name: brandProfile.brandName };
    const counts = aggregateEntityMentions(mentions, brand, competitors);

    const nameById = new Map<string, string>([
        [brand.id, brand.name],
        ...competitors.map((c) => [c.id, c.name] as [string, string]),
    ]);
    const rows = buildComparisonRows(counts, nameById);
    const totalMentions = counts.reduce((s, c) => s + c.mentionCount, 0);

    return { hasData: totalMentions > 0, rows, totalMentions };
}
