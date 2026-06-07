/**
 * Usage & cost read layer — aggregates api_usage for a workspace.
 *
 * Validates: Requirement 10.1 (per-workspace usage by engine), 10.2 (estimated cost)
 */

import { db } from '@/lib/db';

export interface EngineUsage {
    engine: string;
    callCount: number;
    estimatedCost: number;
}

export interface UsageData {
    hasData: boolean;
    byEngine: EngineUsage[];
    totalCalls: number;
    totalCost: number;
}

function roundTo(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

/** Aggregate all-time api usage for a workspace, grouped by engine. */
export async function loadWorkspaceUsage(workspaceId: string): Promise<UsageData> {
    const grouped = await db.apiUsage.groupBy({
        by: ['engine'],
        where: { workspaceId },
        _sum: { callCount: true, estimatedCost: true },
    });

    const byEngine: EngineUsage[] = grouped
        .map((g) => ({
            engine: g.engine,
            callCount: g._sum.callCount ?? 0,
            estimatedCost: roundTo(g._sum.estimatedCost ?? 0, 4),
        }))
        .sort((a, b) => b.callCount - a.callCount);

    const totalCalls = byEngine.reduce((s, e) => s + e.callCount, 0);
    const totalCost = roundTo(
        byEngine.reduce((s, e) => s + e.estimatedCost, 0),
        4,
    );

    return { hasData: byEngine.length > 0, byEngine, totalCalls, totalCost };
}
