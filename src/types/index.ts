/**
 * Shared type definitions for MeasureX.
 */

export type EngineId = 'chatgpt' | 'perplexity';

export type MentionPosition = 'first' | 'middle' | 'last' | null;

export type RecommendationStrength = 'explicit' | 'neutral' | 'none';

export type PromptIntent =
    | 'informational'
    | 'navigational'
    | 'commercial'
    | 'transactional';

export type ImpactLevel = 'high' | 'medium' | 'low';

export type CitationClass =
    | 'brand'
    | 'competitor'
    | 'review_site'
    | 'publication'
    | 'forum'
    | 'other';

export interface Citation {
    url: string;
    domain: string;
    classification: CitationClass;
}

export interface ExtractionResult {
    brandMentioned: boolean;
    mentionPosition: MentionPosition;
    recommendationStrength: RecommendationStrength;
    brandCited: boolean;
    confidenceScore: number;
    ambiguous: boolean;
    citations: Citation[];
}

export interface ScoreWeights {
    mention: number;
    position: number;
    recommendation: number;
    citation: number;
}

export interface StandardizedResponse {
    rawText: string;
    citations: Citation[];
    metadata: Record<string, unknown>;
    modelVersion: string;
    timestamp: Date;
    executionTimeMs: number;
}
