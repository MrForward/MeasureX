/**
 * Recommendations read layer — loads the latest run's recommendations for the
 * dashboard, ordered by impact then confidence (Requirement 8.3).
 */

import { db } from '@/lib/db';
import type { ImpactLevel } from '@/types';

const COMPLETED_STATUSES = ['completed', 'partial'] as const;
const IMPACT_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

export interface RecommendationRow {
    id: string;
    evidenceText: string;
    action: string;
    impactLevel: ImpactLevel;
    confidence: number;
    promptId: string | null;
    promptText: string | null;
}

export interface RecommendationsData {
    hasData: boolean;
    rows: RecommendationRow[];
}

/**
 * Load the latest completed run's recommendations, highest-impact first.
 * Read path — always resolves; `hasData: false` when there are none.
 */
export async function loadRecommendations(
    workspaceId: string,
): Promise<RecommendationsData> {
    const latestRun = await db.run.findFirst({
        where: { workspaceId, status: { in: [...COMPLETED_STATUSES] } },
        orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true },
    });
    if (!latestRun) return { hasData: false, rows: [] };

    const recs = await db.recommendation.findMany({
        where: { runId: latestRun.id },
        select: {
            id: true,
            evidenceText: true,
            action: true,
            impactLevel: true,
            confidence: true,
            promptId: true,
        },
    });
    if (recs.length === 0) return { hasData: false, rows: [] };

    // Resolve prompt text for prompt-scoped recommendations.
    const promptIds = Array.from(
        new Set(recs.map((r) => r.promptId).filter((id): id is string => Boolean(id))),
    );
    const prompts = promptIds.length
        ? await db.prompt.findMany({
              where: { id: { in: promptIds } },
              select: { id: true, text: true },
          })
        : [];
    const promptText = new Map(prompts.map((p) => [p.id, p.text]));

    const rows: RecommendationRow[] = recs
        .map((r) => ({
            id: r.id,
            evidenceText: r.evidenceText,
            action: r.action,
            impactLevel: r.impactLevel as ImpactLevel,
            confidence: r.confidence,
            promptId: r.promptId,
            promptText: r.promptId ? promptText.get(r.promptId) ?? null : null,
        }))
        .sort(
            (a, b) =>
                (IMPACT_RANK[b.impactLevel] ?? 0) - (IMPACT_RANK[a.impactLevel] ?? 0) ||
                b.confidence - a.confidence,
        );

    return { hasData: true, rows };
}
