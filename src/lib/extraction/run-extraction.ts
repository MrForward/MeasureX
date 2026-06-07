/**
 * Entity-extraction orchestrator — the composition root for the §4 pipeline.
 *
 * The individual extraction stages (exact match, fuzzy match, position,
 * recommendation strength, citation classification, ambiguity) were each built
 * and unit-tested in Phase 3, but nothing chained them together. This module is
 * that missing entry point: given a raw response and the workspace's brand +
 * competitor configuration, it runs the full pipeline and returns a single
 * {@link ExtractionResult} ready for scoring, plus the raw match/citation data
 * for persistence into the `extractions` table.
 *
 * Pipeline (design.md §4):
 *   1. Exact match (brand name, aliases, competitor names)
 *   2. Fuzzy match (suppressing positions already claimed by exact matches)
 *   3. URL extraction → merge with engine-provided citations
 *   4. Citation classification (brand / competitor / third-party)
 *   5. Position analysis (first / middle / last third of earliest brand mention)
 *   6. Recommendation-strength detection (rules first, ≤1 LLM call)
 *   7. Confidence + ambiguity flagging (confidence < 0.7 → ambiguous)
 *
 * Pure orchestration — no DB or network access here. The optional `classifier`
 * is the only outbound dependency and is injected by the caller, so this stays
 * fully unit-testable.
 *
 * Validates: Requirement 5 (entity & citation extraction), Requirement 6.6
 *            (extraction feeds the metric that links back to its execution)
 */

import type { Citation, ExtractionResult } from '@/types';
import type { MatchableEntity, EntityMatch } from './types';
import { findExactMatches } from './exact-match';
import { findFuzzyMatches } from './fuzzy-match';
import { getBrandMentionPosition, getEarliestMatch } from './position-analysis';
import {
    detectRecommendationStrength,
    type LLMClassifier,
} from './recommendation-strength';
import { extractCitationsFromText } from './url-extract';
import { classifyCitations } from './citation-classify';
import { isAmbiguous } from './ambiguity';

// ── Input / output ──────────────────────────────────────────────────────────

export interface RunExtractionInput {
    /** The raw AI response text to extract from. */
    responseText: string;
    /** Citations the engine reported directly (e.g. Perplexity's array). */
    responseCitations?: Citation[];
    /** The monitored brand as a matchable entity (`type: 'brand'`). */
    brand: MatchableEntity;
    /** Configured competitors (`type: 'competitor'`). */
    competitors: MatchableEntity[];
    /**
     * Optional LLM classifier for recommendation-strength disambiguation.
     * When omitted, extraction runs rules-only (zero LLM cost).
     */
    classifier?: LLMClassifier;
}

export interface RunExtractionOutput {
    /** Scoring-ready result consumed by `computeVisibilityScore`. */
    result: ExtractionResult;
    /** Every detected mention (brand + competitor) — persisted as `mentionsJson`. */
    mentions: EntityMatch[];
    /** Count of brand mentions only — feeds the metric's `mentionCount`. */
    brandMentionCount: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Merge engine-provided citations with URLs extracted from the response text,
 * de-duplicated by normalized domain + url so the same source is not counted
 * twice. Engine-provided citations win on conflict (they are authoritative).
 */
function mergeCitations(
    engineCitations: Citation[],
    textCitations: Citation[],
): Citation[] {
    const byKey = new Map<string, Citation>();
    for (const c of [...engineCitations, ...textCitations]) {
        const key = `${c.domain}|${c.url}`;
        if (!byKey.has(key)) {
            byKey.set(key, { ...c });
        }
    }
    return Array.from(byKey.values());
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

/**
 * Run the full entity-extraction pipeline for a single response.
 *
 * Never throws on empty/unparseable input — an empty response yields a valid
 * "no mention, full confidence" result (design.md edge case: "I don't have
 * information about that" is a legitimate zero, not an error).
 */
export async function runExtraction(
    input: RunExtractionInput,
): Promise<RunExtractionOutput> {
    const { responseText, brand, competitors, classifier } = input;
    const text = responseText ?? '';
    const entities: MatchableEntity[] = [brand, ...competitors];

    // 1-2. Exact then fuzzy matching (fuzzy suppresses exact-claimed positions).
    const exact = findExactMatches(text, entities);
    const fuzzy = findFuzzyMatches(
        text,
        entities,
        exact.map((m) => m.position),
    );
    const mentions = [...exact, ...fuzzy].sort((a, b) => a.position - b.position);

    const brandMentions = mentions.filter((m) => m.entityType === 'brand');
    const brandMentioned = brandMentions.length > 0;

    // 3-4. Citations: merge engine + text-extracted, then classify.
    const citations = mergeCitations(
        input.responseCitations ?? [],
        extractCitationsFromText(text),
    );
    const competitorDomains = competitors.map((c) => ({
        entityId: c.id,
        domain: c.domain,
    }));
    classifyCitations(citations, brand.domain, competitorDomains);
    const brandCited = citations.some((c) => c.classification === 'brand');

    // 5. Position of the earliest brand mention.
    const mentionPosition = getBrandMentionPosition(brandMentions, text.length);

    // 6. Recommendation strength (rules first, ≤1 LLM call) for the earliest
    //    brand mention. No brand mention → 'none'.
    const earliestBrand = getEarliestMatch(brandMentions);
    const recommendationStrength = earliestBrand
        ? await detectRecommendationStrength(
              text,
              earliestBrand.position,
              earliestBrand.matchedText.length,
              classifier,
          )
        : 'none';

    // 7. Confidence + ambiguity. Confidence reflects the brand match certainty;
    //    when the brand is absent we are fully confident in its absence (1.0).
    const confidenceScore = earliestBrand ? earliestBrand.confidence : 1.0;
    const ambiguous = earliestBrand ? isAmbiguous(earliestBrand) : false;

    const result: ExtractionResult = {
        brandMentioned,
        mentionPosition,
        recommendationStrength,
        brandCited,
        confidenceScore,
        ambiguous,
        citations,
    };

    return {
        result,
        mentions,
        brandMentionCount: brandMentions.length,
    };
}
