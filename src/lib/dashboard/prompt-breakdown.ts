/**
 * Prompt-level breakdown data layer.
 *
 * Powers the dashboard's per-prompt performance table: for the latest completed
 * run, each prompt's Visibility_Score, mention count, citation rate, and a
 * per-engine breakdown.
 *
 * Validates: Requirement 7.2 (prompt-level table: per-prompt score, mention
 *            count, citation count per engine)
 */

import { db } from '@/lib/db';

const COMPLETED_STATUSES = ['completed', 'partial'] as const;

/** Per-engine numbers for a single prompt. */
export interface EngineScore {
    engine: string;
    visibilityScore: number;
    mentionCount: number;
    citationRate: number;
    /** Source execution, for the "view source" evidence drill-down. */
    executionId: string | null;
}

/** One row of the prompt-level table — a prompt aggregated across its engines. */
export interface PromptBreakdownRow {
    promptId: string;
    text: string;
    intent: string | null;
    /** Average Visibility_Score across this prompt's engines. */
    visibilityScore: number;
    /** Total brand mentions across this prompt's engines. */
    totalMentions: number;
    /** Average citation rate (0-100) across this prompt's engines. */
    citationRate: number;
    engines: EngineScore[];
}

export interface PromptBreakdownData {
    hasData: boolean;
    rows: PromptBreakdownRow[];
}

/** A metric row as needed by the aggregator (decoupled from Prisma). */
export interface MetricForBreakdown {
    promptId: string | null;
    engine: string | null;
    visibilityScore: number;
    mentionCount: number;
    citationRate: number;
    rawExecutionId?: string | null;
}

function roundTo(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

/**
 * Aggregate per-(prompt,engine) metric rows into per-prompt rows. Pure — no I/O.
 *
 * Rows missing a promptId are ignored (workspace-level rollups don't belong in
 * a per-prompt table). Each prompt's score/citation-rate is the equal-weighted
 * average across its engines; mentions are summed. Rows are sorted by score
 * descending so the best-performing prompts surface first.
 */
export function aggregatePromptBreakdown(
    metrics: MetricForBreakdown[],
    prompts: Map<string, { text: string; intent: string | null }>,
): PromptBreakdownRow[] {
    const byPrompt = new Map<string, MetricForBreakdown[]>();
    for (const m of metrics) {
        if (!m.promptId) continue;
        const list = byPrompt.get(m.promptId) ?? [];
        list.push(m);
        byPrompt.set(m.promptId, list);
    }

    const rows: PromptBreakdownRow[] = [];
    for (const [promptId, group] of Array.from(byPrompt.entries())) {
        const meta = prompts.get(promptId);
        if (!meta) continue; // prompt deleted/unknown — skip

        const engines: EngineScore[] = group
            .map((m) => ({
                engine: m.engine ?? 'unknown',
                visibilityScore: Math.round(m.visibilityScore),
                mentionCount: m.mentionCount,
                citationRate: roundTo(m.citationRate, 1),
                executionId: m.rawExecutionId ?? null,
            }))
            .sort((a, b) => a.engine.localeCompare(b.engine));

        const scoreSum = group.reduce((s, m) => s + m.visibilityScore, 0);
        const mentionSum = group.reduce((s, m) => s + m.mentionCount, 0);
        const citationSum = group.reduce((s, m) => s + m.citationRate, 0);

        rows.push({
            promptId,
            text: meta.text,
            intent: meta.intent,
            visibilityScore: Math.round(scoreSum / group.length),
            totalMentions: mentionSum,
            citationRate: roundTo(citationSum / group.length, 1),
            engines,
        });
    }

    rows.sort((a, b) => b.visibilityScore - a.visibilityScore);
    return rows;
}

/**
 * Load the prompt-level breakdown for the workspace's latest completed run.
 * Read path — always resolves; `hasData: false` when there are no metrics yet.
 */
export async function loadPromptBreakdown(
    workspaceId: string,
): Promise<PromptBreakdownData> {
    const latestRun = await db.run.findFirst({
        where: { workspaceId, status: { in: [...COMPLETED_STATUSES] } },
        orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true },
    });

    if (!latestRun) {
        return { hasData: false, rows: [] };
    }

    const metrics = await db.metric.findMany({
        where: { runId: latestRun.id },
        select: {
            promptId: true,
            engine: true,
            visibilityScore: true,
            mentionCount: true,
            citationRate: true,
            rawExecutionId: true,
        },
    });

    if (metrics.length === 0) {
        return { hasData: false, rows: [] };
    }

    const promptIds = Array.from(
        new Set(metrics.map((m) => m.promptId).filter((id): id is string => Boolean(id))),
    );
    const prompts = await db.prompt.findMany({
        where: { id: { in: promptIds } },
        select: { id: true, text: true, intent: true },
    });
    const promptMap = new Map(prompts.map((p) => [p.id, { text: p.text, intent: p.intent }]));

    const rows = aggregatePromptBreakdown(metrics, promptMap);
    return { hasData: rows.length > 0, rows };
}
