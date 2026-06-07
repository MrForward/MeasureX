/**
 * Evidence drill-down data layer ("view source").
 *
 * For a single execution, assembles everything needed to justify its
 * visibility score: the raw AI response, the four-factor score breakdown, the
 * detected mentions, and the classified citations. This is the transparent
 * evidence layer — every score traces back to the exact response that produced it.
 *
 * Validates: Requirement 19.2 (view source: raw response + extraction results),
 *            19.4 (score breakdown showing each factor's contribution),
 *            7.5 (click a metric → underlying raw response data)
 */

import { db } from '@/lib/db';
import type { Citation } from '@/types';
import { getStoredContent, parseStoredResponse } from '@/lib/storage/r2';
import {
    getScoreBreakdown,
    loadScoreWeights,
} from '@/lib/metrics/visibility-score';
import { toExtractionResult } from '@/lib/metrics/compute-run-metrics';

/** A detected mention as stored in Extraction.mentionsJson. */
export interface EvidenceMention {
    entityType: string;
    matchedText: string;
    matchType: string;
    confidence: number;
    position: number;
}

export interface EvidenceData {
    promptText: string;
    intent: string | null;
    engine: string;
    modelVersion: string | null;
    runId: string;
    /** The 0-100 visibility score and its four weighted factors. */
    visibilityScore: number;
    breakdown: ReturnType<typeof getScoreBreakdown>;
    /** Extraction summary. */
    brandMentioned: boolean;
    mentionPosition: string | null;
    recommendationStrength: string | null;
    brandCited: boolean;
    confidenceScore: number;
    ambiguous: boolean;
    /** The raw AI response text, or null when unavailable. */
    responseText: string | null;
    mentions: EvidenceMention[];
    citations: Citation[];
}

/**
 * Load the full evidence for an execution, scoped to the workspaces the user
 * can access (so cross-workspace ids can't be read). Returns null when not found.
 */
export async function loadEvidence(
    executionId: string,
    workspaceIds: string[],
): Promise<EvidenceData | null> {
    const execution = await db.execution.findFirst({
        // Scope through the run so cross-workspace ids can't be read.
        where: { id: executionId, run: { workspaceId: { in: workspaceIds } } },
        select: {
            engine: true,
            runId: true,
            modelVersion: true,
            rawResponseRef: true,
            rawResponseBody: true,
            prompt: { select: { text: true, intent: true } },
            extraction: true,
        },
    });

    if (!execution || !execution.extraction) {
        return null;
    }

    const ext = execution.extraction;
    const mentions: EvidenceMention[] = Array.isArray(ext.mentionsJson)
        ? (ext.mentionsJson as unknown as EvidenceMention[])
        : [];
    const citations: Citation[] = Array.isArray(ext.citationsJson)
        ? (ext.citationsJson as unknown as Citation[])
        : [];

    const extractionResult = toExtractionResult({
        brandMentioned: ext.brandMentioned,
        mentionPosition: ext.mentionPosition,
        recommendationStrength: ext.recommendationStrength,
        brandCited: ext.brandCited,
        confidenceScore: ext.confidenceScore,
        ambiguous: ext.ambiguous,
        mentions: [],
        citations,
    });

    const weights = await loadScoreWeights();
    const breakdown = getScoreBreakdown(extractionResult, weights);

    const content = await getStoredContent(execution);
    const response = parseStoredResponse(content);

    return {
        promptText: execution.prompt.text,
        intent: execution.prompt.intent,
        engine: execution.engine,
        modelVersion: execution.modelVersion,
        runId: execution.runId,
        visibilityScore: breakdown.total,
        breakdown,
        brandMentioned: ext.brandMentioned,
        mentionPosition: ext.mentionPosition,
        recommendationStrength: ext.recommendationStrength,
        brandCited: ext.brandCited,
        confidenceScore: ext.confidenceScore,
        ambiguous: ext.ambiguous,
        responseText: response?.rawText ?? null,
        mentions,
        citations,
    };
}
