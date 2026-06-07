/**
 * Per-run recommendation orchestration.
 *
 * Gathers the run's per-prompt performance and brand share of voice, runs the
 * (pure) recommendation generator, and persists the results. Idempotent: clears
 * the run's prior recommendations before inserting, so a retried job can't
 * duplicate.
 *
 * Validates: Requirement 8 (recommendations engine), 4.5 (pipeline stage)
 */

import { db } from '@/lib/db';
import {
    aggregatePromptBreakdown,
    type MetricForBreakdown,
} from '@/lib/dashboard/prompt-breakdown';
import {
    aggregateEntityMentions,
    type MentionLike,
} from '@/lib/dashboard/competitor-comparison';
import { brandShareOfVoice } from '@/lib/metrics/share-of-voice';
import { generateRecommendations, type PromptPerformance } from './generate';

/**
 * Compute and persist recommendations for a completed run. Returns the count.
 */
export async function computeRunRecommendations(
    runId: string,
    workspaceId: string,
): Promise<number> {
    const [metrics, brandProfile, competitors, extractions] = await Promise.all([
        db.metric.findMany({
            where: { runId },
            select: { promptId: true, engine: true, visibilityScore: true, mentionCount: true, citationRate: true },
        }),
        db.brandProfile.findFirst({
            where: { workspaceId },
            orderBy: { version: 'desc' },
            select: { id: true, brandName: true },
        }),
        db.competitor.findMany({
            where: { workspaceId, active: true },
            select: { id: true },
        }),
        db.extraction.findMany({
            where: { execution: { runId } },
            select: { mentionsJson: true },
        }),
    ]);

    if (!brandProfile || metrics.length === 0) {
        return 0;
    }

    // Per-prompt performance (reuse the dashboard aggregator).
    const promptIds = Array.from(
        new Set(metrics.map((m) => m.promptId).filter((id): id is string => Boolean(id))),
    );
    const prompts = await db.prompt.findMany({
        where: { id: { in: promptIds } },
        select: { id: true, text: true, intent: true },
    });
    const promptMap = new Map(prompts.map((p) => [p.id, { text: p.text, intent: p.intent }]));
    const rows = aggregatePromptBreakdown(metrics as MetricForBreakdown[], promptMap);
    const perf: PromptPerformance[] = rows.map((r) => ({
        promptId: r.promptId,
        text: r.text,
        visibilityScore: r.visibilityScore,
        mentionCount: r.totalMentions,
        citationRate: r.citationRate,
    }));

    // Brand share of voice across the run.
    const mentions: MentionLike[] = extractions.flatMap((e) =>
        Array.isArray(e.mentionsJson) ? (e.mentionsJson as unknown as MentionLike[]) : [],
    );
    const counts = aggregateEntityMentions(
        mentions,
        { id: brandProfile.id, name: brandProfile.brandName },
        competitors.map((c) => ({ id: c.id, name: '' })),
    );
    const sov = brandShareOfVoice(counts);

    const drafts = generateRecommendations({
        brandName: brandProfile.brandName,
        brandShareOfVoice: sov,
        prompts: perf,
    });

    // Idempotent persist.
    await db.recommendation.deleteMany({ where: { runId } });
    if (drafts.length === 0) {
        return 0;
    }
    await db.recommendation.createMany({
        data: drafts.map((d) => ({
            workspaceId,
            runId,
            evidenceText: d.evidenceText,
            action: d.action,
            impactLevel: d.impactLevel,
            confidence: d.confidence,
            promptId: d.promptId,
        })),
    });

    return drafts.length;
}
