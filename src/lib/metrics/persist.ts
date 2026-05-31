/**
 * Metric persistence layer — stores computed metrics together with a mandatory
 * link to the raw execution they were derived from.
 *
 * Every metric MUST reference its source execution so that the dashboard can
 * always trace a displayed number back to the exact raw AI response that
 * produced it ("view source"). This linkage is enforced at write time: a
 * metric without a `rawExecutionId` is rejected before it ever reaches the DB.
 *
 * Validates: Requirement 6.6 (link every computed metric to the specific raw
 *            response data from which it was derived)
 * Validates: Property 3 (Metric Traceability — FOR ALL displayed metrics there
 *            SHALL exist a valid chain: metric → execution → raw_response)
 */

import { db } from '@/lib/db';
import type { EngineId } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Input for persisting a single per-prompt-engine metric.
 *
 * `rawExecutionId` is REQUIRED — it is the foreign key into the `executions`
 * table that anchors the metric to its source raw response (Property 3).
 */
export interface MetricRecord {
    workspaceId: string;
    runId: string;
    promptId: string;
    engine: EngineId;
    date: Date;
    visibilityScore: number;
    mentionCount: number;
    avgPosition: number | null;
    citationRate: number;
    wowChange: number | null;
    rolling4wkAvg: number | null;
    /** REQUIRED — the source execution this metric was derived from (Property 3). */
    rawExecutionId: string;
}

/** Result of validating a metric's traceability link. */
export interface TraceabilityValidation {
    valid: boolean;
    reason?: string;
}

/**
 * The full traceability chain for a metric:
 *   metric → execution → raw_response (ref + checksum).
 */
export interface TraceabilityChain {
    metricId: string;
    executionId: string;
    rawResponseRef: string | null;
    responseChecksum: string | null;
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate that a metric record has a valid source-execution link.
 *
 * A metric is only traceable if it carries a non-empty `rawExecutionId`. This
 * function is the single point that enforces Property 3 at write time.
 *
 * Validates: Requirement 6.6, Property 3
 */
export function validateTraceability(record: MetricRecord): TraceabilityValidation {
    if (
        record.rawExecutionId === undefined ||
        record.rawExecutionId === null ||
        record.rawExecutionId.trim() === ''
    ) {
        return {
            valid: false,
            reason: 'rawExecutionId is required — a metric must reference its source execution',
        };
    }
    return { valid: true };
}

// ── Persistence ─────────────────────────────────────────────────────────────

/** Map a validated MetricRecord onto the Prisma `metric.create` data shape. */
function toCreateData(record: MetricRecord) {
    return {
        workspaceId: record.workspaceId,
        runId: record.runId,
        promptId: record.promptId,
        engine: record.engine,
        date: record.date,
        visibilityScore: record.visibilityScore,
        mentionCount: record.mentionCount,
        avgPosition: record.avgPosition,
        citationRate: record.citationRate,
        wowChange: record.wowChange,
        rolling4wkAvg: record.rolling4wkAvg,
        rawExecutionId: record.rawExecutionId,
    };
}

/**
 * Persist a single metric, enforcing traceability.
 *
 * Throws if the record has no source execution — an untraceable metric is not
 * allowed to be written. Returns the new metric's ID on success.
 *
 * Validates: Requirement 6.6, Property 3
 */
export async function persistMetric(record: MetricRecord): Promise<string> {
    const validation = validateTraceability(record);
    if (!validation.valid) {
        throw new Error(`Cannot persist metric: ${validation.reason}`);
    }

    const created = await db.metric.create({
        data: toCreateData(record),
        select: { id: true },
    });

    return created.id;
}

/**
 * Persist many metrics atomically (all-or-nothing).
 *
 * ALL records are validated first; if any record is untraceable the function
 * throws before persisting any of them, so a batch never leaves behind a
 * partially-written, partially-traceable set. On success the metrics are
 * written inside a single transaction. Returns the number persisted.
 *
 * Validates: Requirement 6.6, Property 3
 */
export async function persistMetrics(records: MetricRecord[]): Promise<number> {
    // Validate everything up front — fail before any write.
    records.forEach((record, index) => {
        const validation = validateTraceability(record);
        if (!validation.valid) {
            throw new Error(
                `Cannot persist metrics: record at index ${index} is invalid — ${validation.reason}`,
            );
        }
    });

    if (records.length === 0) {
        return 0;
    }

    await db.$transaction(
        records.map((record) => db.metric.create({ data: toCreateData(record) })),
    );

    return records.length;
}

// ── Traceability retrieval ────────────────────────────────────────────────────

/**
 * Retrieve the full traceability chain for a metric: walk
 * metric → execution → raw_response and return the matching IDs plus the raw
 * response reference and checksum.
 *
 * Returns null when the metric does not exist. When the metric exists but has
 * no linked execution (legacy data), `executionId` is the empty string and the
 * raw-response fields are null.
 *
 * Validates: Requirement 6.6, Property 3
 */
export async function getTraceabilityChain(
    metricId: string,
): Promise<TraceabilityChain | null> {
    const metric = await db.metric.findUnique({
        where: { id: metricId },
        select: { id: true, rawExecutionId: true },
    });

    if (metric === null) {
        return null;
    }

    const executionId = metric.rawExecutionId ?? '';

    if (executionId === '') {
        return {
            metricId: metric.id,
            executionId: '',
            rawResponseRef: null,
            responseChecksum: null,
        };
    }

    const execution = await db.execution.findUnique({
        where: { id: executionId },
        select: { id: true, rawResponseRef: true, responseChecksum: true },
    });

    return {
        metricId: metric.id,
        executionId,
        rawResponseRef: execution?.rawResponseRef ?? null,
        responseChecksum: execution?.responseChecksum ?? null,
    };
}
