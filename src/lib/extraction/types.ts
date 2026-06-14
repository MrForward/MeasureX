/**
 * Extraction-pipeline type definitions — aligned to PRD §F5 (Extraction Pipeline)
 * and the `Extraction` model in PRD §5 (Data Model).
 *
 * The pipeline is rule-based only (no LLM calls). It analyzes a single raw AI
 * engine response and produces the {@link Extraction} shape consumed by the
 * scoring engine (§F6) and persisted to the `extractions` table.
 */

/** Recommendation strength classification (PRD §F5d). */
export type RecommendationStrength = 'RECOMMENDED' | 'MENTIONED' | 'ABSENT';

/** Citation source classification (PRD §F5c). */
export type CitationClassification =
    | 'owned'
    | 'competitor'
    | 'review_site'
    | 'publication'
    | 'forum'
    | 'other';

/**
 * An entity (brand or competitor) the pipeline searches for. `id` ties results
 * back to the Brand / Competitor record; `name` and `domain` are the match
 * targets.
 */
export interface ExtractionEntity {
    id: string;
    name: string;
    domain: string;
}

/**
 * Per-entity exact-match summary (PRD §F5a output).
 * - `mentioned`: name (word-boundary, case-insensitive) or domain found.
 * - `mentionCount`: total distinct occurrences in the response.
 * - `firstMentionPosition`: character offset of the first occurrence, or null.
 */
export interface EntityMatchResult {
    mentioned: boolean;
    mentionCount: number;
    firstMentionPosition: number | null;
}

/** Per-competitor result embedded in {@link Extraction.competitorResults}. */
export interface CompetitorResult {
    competitorId: string;
    mentioned: boolean;
    /** Rank by first-mention character offset (1 = earliest), or null. */
    position: number | null;
    mentionCount: number;
    recommendation: RecommendationStrength;
}

/** A single classified citation (PRD §F5c). */
export interface CitationResult {
    url: string;
    domain: string;
    classification: CitationClassification;
    /** Present only when `classification === 'competitor'`. */
    competitorName?: string;
}

/**
 * The full extraction result for one response — the exact shape returned by
 * `runExtraction` (PRD §F5 "Storage per extraction").
 */
export interface Extraction {
    brandMentioned: boolean;
    /** Brand's rank by mention order (1 = first), or null when absent. */
    brandPosition: number | null;
    brandMentionCount: number;
    brandRecommendation: RecommendationStrength;
    competitorResults: CompetitorResult[];
    citations: CitationResult[];
    /** 0-4 per-prompt-engine score (PRD §F6). */
    promptScore: number;
}
