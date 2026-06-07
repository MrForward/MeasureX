/**
 * Extraction job orchestration — the DB-bound glue between a stored raw response
 * and a persisted `extractions` row.
 *
 * Mirrors the execute-job → route split: this module does the database work
 * (load config, load raw response, run the pipeline, persist) and the route
 * handler stays a thin webhook adapter.
 *
 * Deadlock-safety (the trap fixed here): the metrics job only fires once EVERY
 * successful execution has an extraction row (scheduler/pipeline.ts). If
 * extraction could fail without leaving a row, the run would hang forever. So
 * this function ALWAYS writes a terminal extraction record — even on failure it
 * persists an empty "extraction failed" row so the pipeline gate can resolve.
 *
 * Validates: Requirement 5 (extraction), Requirement 18.3 (unparseable response
 *            → mark extraction failed, continue), Requirement 4.5 (pipeline)
 */

import { db } from '@/lib/db';
import type { EngineId } from '@/types';
import { getStoredContent, parseStoredResponse } from '@/lib/storage/r2';
import type { MatchableEntity } from './types';
import { runExtraction } from './run-extraction';

export interface ExtractJobResult {
    status: 'extracted' | 'empty' | 'failed';
    executionId: string;
    /** True when the brand was found in the response. */
    brandMentioned?: boolean;
    /** Reason, when status is 'empty' or 'failed'. */
    reason?: string;
}

/** The empty terminal extraction written when real extraction can't proceed. */
function emptyExtractionData(executionId: string) {
    return {
        executionId,
        brandMentioned: false,
        mentionPosition: null,
        recommendationStrength: 'none',
        brandCited: false,
        confidenceScore: 0,
        ambiguous: false,
        mentionsJson: [],
        citationsJson: [],
    };
}

/**
 * Run extraction for a single completed execution and persist the result.
 *
 * Never throws — every outcome (success, empty, failure) writes an extraction
 * row so the run can always progress to metrics. Uses an upsert keyed on the
 * unique `executionId` so re-delivery of the same job is idempotent.
 */
export async function extractJob(
    executionId: string,
    workspaceId: string,
): Promise<ExtractJobResult> {
    // Idempotency: if this execution already has an extraction, do nothing.
    const existing = await db.extraction.findUnique({
        where: { executionId },
        select: { id: true },
    });
    if (existing) {
        return { status: 'extracted', executionId, reason: 'already_extracted' };
    }

    // Load the execution's stored response location.
    const execution = await db.execution.findUnique({
        where: { id: executionId },
        select: { rawResponseRef: true, rawResponseBody: true },
    });

    const persistEmpty = async (reason: string): Promise<ExtractJobResult> => {
        await db.extraction.upsert({
            where: { executionId },
            create: emptyExtractionData(executionId),
            update: {},
        });
        return { status: 'failed', executionId, reason };
    };

    if (!execution) {
        return persistEmpty('execution_not_found');
    }

    // Retrieve and parse the raw response (R2 or DB fallback).
    const content = await getStoredContent(execution);
    const response = parseStoredResponse(content);
    if (!response) {
        // Unparseable / missing — terminal empty row keeps the pipeline moving.
        return persistEmpty('raw_response_unavailable');
    }

    // Load brand profile (latest version) + active competitors.
    const [brandProfile, competitors] = await Promise.all([
        db.brandProfile.findFirst({
            where: { workspaceId },
            orderBy: { version: 'desc' },
            select: { id: true, brandName: true, domain: true, aliases: true },
        }),
        db.competitor.findMany({
            where: { workspaceId, active: true },
            select: { id: true, name: true, domain: true, aliases: true },
        }),
    ]);

    if (!brandProfile) {
        return persistEmpty('no_brand_profile');
    }

    const brand: MatchableEntity = {
        id: brandProfile.id,
        type: 'brand',
        name: brandProfile.brandName,
        aliases: brandProfile.aliases,
        domain: brandProfile.domain,
    };
    const competitorEntities: MatchableEntity[] = competitors.map((c) => ({
        id: c.id,
        type: 'competitor',
        name: c.name,
        aliases: c.aliases,
        domain: c.domain,
    }));

    // Run the extraction pipeline (rules-only here; LLM disambiguation is a
    // later enhancement gated by config — kept out of the critical path).
    const { result, mentions } = await runExtraction({
        responseText: response.rawText,
        responseCitations: response.citations,
        brand,
        competitors: competitorEntities,
    });

    await db.extraction.upsert({
        where: { executionId },
        create: {
            executionId,
            brandMentioned: result.brandMentioned,
            mentionPosition: result.mentionPosition,
            recommendationStrength: result.recommendationStrength,
            brandCited: result.brandCited,
            confidenceScore: result.confidenceScore,
            ambiguous: result.ambiguous,
            mentionsJson: mentions as unknown as object,
            citationsJson: result.citations as unknown as object,
        },
        update: {},
    });

    return {
        status: result.brandMentioned ? 'extracted' : 'empty',
        executionId,
        brandMentioned: result.brandMentioned,
    };
}
