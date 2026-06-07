/**
 * API usage + cost tracking.
 *
 * Records every engine call into the `api_usage` table (per workspace, per
 * engine, per day) so the admin/usage views can report call volume and
 * estimated spend. This closes audit finding #2 ("cost tracking never
 * instrumented" — implementation-guide guardrail "Never skip cost tracking").
 *
 * Validates: Requirement 10.1 (per-workspace usage by engine), 10.2 (cost
 *            estimation), 7.8 (per-call cost tracking)
 */

import { db } from '@/lib/db';

/**
 * Representative cost-per-call (USD) by engine, from design.md's cost model.
 * Real adapters can override via getCostPerCall(); these are the demo/fallback
 * figures so usage views show meaningful numbers without live billing data.
 */
const ENGINE_COST_PER_CALL: Record<string, number> = {
    chatgpt: 0.0015,
    perplexity: 0.005,
    google_ai: 0.01,
};

/** Estimated cost for one call to `engine` (0 for unknown engines). */
export function engineCostPerCall(engine: string): number {
    return ENGINE_COST_PER_CALL[engine] ?? 0;
}

/** Today's date as YYYY-MM-DD (the `api_usage.date` key). */
function today(): string {
    return new Date().toISOString().slice(0, 10);
}

/**
 * Record one engine call for a workspace, incrementing the day's call count and
 * estimated cost. Best-effort — never throws (usage tracking must not break the
 * execution path).
 */
export async function trackApiUsage(
    workspaceId: string,
    engine: string,
    cost: number = engineCostPerCall(engine),
): Promise<void> {
    try {
        await db.apiUsage.upsert({
            where: { workspaceId_engine_date: { workspaceId, engine, date: today() } },
            update: {
                callCount: { increment: 1 },
                estimatedCost: { increment: cost },
            },
            create: { workspaceId, engine, date: today(), callCount: 1, estimatedCost: cost },
        });
    } catch (err) {
        console.error('[usage] failed to record api usage', { workspaceId, engine }, err);
    }
}
