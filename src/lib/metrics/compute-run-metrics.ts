/**
 * Per-run metric computation orchestrator — the composition root that turns
 * extraction rows into persisted `metrics`.
 *
 * Phase 3 built `computeVisibilityScore` and `persistMetrics` but nothing joined
 * them: no code read a run's extractions, scored each one, and wrote the metric
 * rows the dashboard reads. This module is that join.
 *
 * For each successful execution in a run we emit exactly one metric row keyed by
 * (run, prompt, engine), anchored to its source execution via `rawExecutionId`
 * so the "view source" traceability chain (Property 3) holds.
 *
 * The pure mapper (`buildMetricRecord`) is separated from the DB orchestration
 * (`computeRunMetrics`) so the scoring logic is unit-testable without a database.
 *
 * Validates: Requirement 6.1 (per prompt-engine Visibility_Score), 6.3 (mention
 *            count, avg position, citation rate), 6.6 (metric → execution link)
 */

import { db } from '@/lib/db';
import type { EngineId } from '@/types';
import type {
    ExtractionResult,
    MentionPosition,
    RecommendationStrength,
    Citation,
} from '@/types';
import { computeVisibilityScore } from './visibility-score';
import { loadScoreWeights } from './visibility-score';
import { persistMetrics, type MetricRecord } from './persist';

// ── Pure mapping ──────────────────────────────────────────────────────────────

/** Minimal execution shape the mapper needs (decoupled from Prisma). */
export interface ExecutionForMetric {
    id: string;
    promptId: string;
    engine: EngineId;
    date: Date;
}

/** Minimal extraction shape the mapper needs (decoupled from Prisma). */
export interface ExtractionForMetric {
    brandMentioned: boolean;
    mentionPosition: string | null;
    recommendationStrength: string | null;
    brandCited: boolean;
    confidenceScore: number;
    ambiguous: boolean;
    /** Persisted mentions array; brand entries drive `mentionCount`. */
    mentions: { entityType: string }[];
    citations: Citation[];
}

/** Map a stored mention position to its numeric rank (first=1 … last=3). */
function positionRank(position: MentionPosition): number | null {
    switch (position) {
        case 'first':
            return 1;
        case 'middle':
            return 2;
        case 'last':
            return 3;
        default:
            return null;
    }
}

/**
 * Rebuild a scoring-ready {@link ExtractionResult} from a persisted extraction
 * row, normalizing nullable DB strings back into the strict union types.
 */
export function toExtractionResult(e: ExtractionForMetric): ExtractionResult {
    return {
        brandMentioned: e.brandMentioned,
        mentionPosition: (e.mentionPosition as MentionPosition) ?? null,
        recommendationStrength:
            (e.recommendationStrength as RecommendationStrength) ?? 'none',
        brandCited: e.brandCited,
        confidenceScore: e.confidenceScore,
        ambiguous: e.ambiguous,
        citations: e.citations,
    };
}

/**
 * Build the metric record for one execution + its extraction. Pure — no I/O.
 *
 * `weights` is passed in (loaded once per run by the orchestrator) so this stays
 * a pure function and the same weights apply to every row in the run.
 */
export function buildMetricRecord(
    workspaceId: string,
    runId: string,
    execution: ExecutionForMetric,
    extraction: ExtractionForMetric,
    weights?: Parameters<typeof computeVisibilityScore>[1],
): MetricRecord {
    const result = toExtractionResult(extraction);
    const visibilityScore = computeVisibilityScore(result, weights);
    const mentionPosition = result.mentionPosition;
    const brandMentionCount = extraction.mentions.filter(
        (m) => m.entityType === 'brand',
    ).length;

    return {
        workspaceId,
        runId,
        promptId: execution.promptId,
        engine: execution.engine,
        date: execution.date,
        visibilityScore,
        mentionCount: brandMentionCount,
        avgPosition: positionRank(mentionPosition),
        // Binary per execution; averaging across rows yields a workspace % (0-100).
        citationRate: result.brandCited ? 100 : 0,
        // Trend fields are computed by the read-side overview from run history;
        // left null at write time to avoid duplicating that logic here.
        wowChange: null,
        rolling4wkAvg: null,
        rawExecutionId: execution.id,
    };
}

// ── DB orchestration ──────────────────────────────────────────────────────────

/**
 * Compute and persist all metric rows for a completed run.
 *
 * Reads every successful execution in the run that has an extraction, scores
 * each one, and writes the metrics atomically. Returns the number persisted.
 * Idempotency note: callers should ensure the metrics job fires once per run
 * (see scheduler/pipeline.ts); re-running would create duplicate rows.
 */
export async function computeRunMetrics(
    runId: string,
    workspaceId: string,
): Promise<number> {
    const executions = await db.execution.findMany({
        where: { runId, status: 'success', extraction: { isNot: null } },
        select: {
            id: true,
            promptId: true,
            engine: true,
            createdAt: true,
            extraction: true,
        },
    });

    if (executions.length === 0) {
        return 0;
    }

    const weights = await loadScoreWeights();

    const records: MetricRecord[] = executions.map((exec) => {
        const ext = exec.extraction!;
        const mentions = Array.isArray(ext.mentionsJson)
            ? (ext.mentionsJson as { entityType: string }[])
            : [];
        const citations = Array.isArray(ext.citationsJson)
            ? (ext.citationsJson as unknown as Citation[])
            : [];

        return buildMetricRecord(
            workspaceId,
            runId,
            {
                id: exec.id,
                promptId: exec.promptId,
                engine: exec.engine as EngineId,
                date: exec.createdAt,
            },
            {
                brandMentioned: ext.brandMentioned,
                mentionPosition: ext.mentionPosition,
                recommendationStrength: ext.recommendationStrength,
                brandCited: ext.brandCited,
                confidenceScore: ext.confidenceScore,
                ambiguous: ext.ambiguous,
                mentions,
                citations,
            },
            weights,
        );
    });

    // Idempotent re-compute: clear any prior metrics for this run before
    // inserting, so a retried metrics job can never leave duplicate rows.
    await db.metric.deleteMany({ where: { runId } });
    return persistMetrics(records);
}
