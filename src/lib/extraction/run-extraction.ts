/**
 * Entity-extraction orchestrator (PRD §F5).
 *
 * Given a single raw AI response plus brand and competitor configuration, runs
 * the full rule-based pipeline and returns the exact {@link Extraction} shape
 * consumed by the scoring engine (§F6) and persisted to the `extractions` table.
 *
 * Pipeline:
 *   1. Exact-match the brand (name + domain).
 *   2. Exact-match each competitor (name + domain).
 *   3. Rank all detected entities by first-mention character offset.
 *   4. Extract citation URLs (response text + engine-native citations).
 *   5. Classify each citation (owned / competitor / review_site / …).
 *   6. Detect brand recommendation strength (and per competitor).
 *   7. Compute promptScore (0-4): 0 absent, 1 mentioned, 2 cited, 3 recommended,
 *      +1 bonus when the brand appears before ALL competitors.
 *
 * Pure orchestration — no DB or network access.
 */

import { exactMatch } from './exact-match';
import { rankByPosition, type RankableEntity } from './position-analysis';
import { detectRecommendationStrength } from './recommendation-strength';
import { extractUrls } from './url-extract';
import { classifyCitations } from './citation-classify';
import type {
    CompetitorResult,
    Extraction,
    ExtractionEntity,
} from './types';

export interface RunExtractionInput {
    /** Raw AI response text to analyze. */
    responseText: string;
    /** Engine-native citation URLs (e.g. Perplexity's `citations` array). */
    nativeCitations?: string[];
    /** The monitored brand. */
    brand: ExtractionEntity;
    /** Configured competitors (max 2 in the MVP). */
    competitors: ExtractionEntity[];
}

const BRAND_RANK_ID = '__brand__';

/**
 * Run the full extraction pipeline for one response. Never throws — an empty or
 * absent response yields a valid "brand absent, score 0" result.
 */
export function runExtraction(input: RunExtractionInput): Extraction {
    const text = input.responseText ?? '';
    const { brand, competitors } = input;

    // 1-2. Exact match brand + each competitor.
    const brandMatch = exactMatch(text, brand.name, brand.domain);
    const competitorMatches = competitors.map((c) => ({
        entity: c,
        match: exactMatch(text, c.name, c.domain),
    }));

    // 3. Rank all detected entities by first-mention offset.
    const rankInputs: RankableEntity[] = [
        { id: BRAND_RANK_ID, firstMentionPosition: brandMatch.firstMentionPosition },
        ...competitorMatches.map(({ entity, match }) => ({
            id: entity.id,
            firstMentionPosition: match.firstMentionPosition,
        })),
    ];
    const ranks = rankByPosition(rankInputs);
    const brandPosition = ranks.get(BRAND_RANK_ID) ?? null;

    // 4-5. Citations: response-text URLs + engine-native, then classify.
    const urls = [...extractUrls(text), ...(input.nativeCitations ?? [])];
    const citations = classifyCitations(urls, brand.domain, competitors);
    const brandCited = citations.some((c) => c.classification === 'owned');

    // 6. Recommendation strength — brand and each competitor.
    const brandRecommendation = detectRecommendationStrength(
        text,
        brand.name,
        brandMatch.mentioned,
    );

    const competitorResults: CompetitorResult[] = competitorMatches.map(
        ({ entity, match }) => ({
            competitorId: entity.id,
            mentioned: match.mentioned,
            position: ranks.get(entity.id) ?? null,
            mentionCount: match.mentionCount,
            recommendation: detectRecommendationStrength(
                text,
                entity.name,
                match.mentioned,
            ),
        }),
    );

    // 7. promptScore (0-4). Highest applicable base + bonus.
    const promptScore = computePromptScore({
        brandMentioned: brandMatch.mentioned,
        brandCited,
        brandRecommended: brandRecommendation === 'RECOMMENDED',
        brandFirstPosition: brandMatch.firstMentionPosition,
        competitorPositions: competitorMatches
            .map(({ match }) => match.firstMentionPosition)
            .filter((p): p is number => p !== null),
    });

    return {
        brandMentioned: brandMatch.mentioned,
        brandPosition,
        brandMentionCount: brandMatch.mentionCount,
        brandRecommendation,
        competitorResults,
        citations,
        promptScore,
    };
}

interface PromptScoreInput {
    brandMentioned: boolean;
    brandCited: boolean;
    brandRecommended: boolean;
    brandFirstPosition: number | null;
    competitorPositions: number[];
}

/**
 * Compute the 0-4 per-prompt-engine score (PRD §F6).
 *
 * Base (highest applicable, not cumulative):
 *   absent → 0, mentioned → 1, cited → 2, recommended → 3.
 * Bonus: +1 when the brand is mentioned and appears before ALL tracked
 * competitors (strictly earlier first-mention offset than every competitor).
 * Capped at 4.
 */
export function computePromptScore(input: PromptScoreInput): number {
    if (!input.brandMentioned || input.brandFirstPosition === null) {
        return 0;
    }

    let base: number;
    if (input.brandRecommended) {
        base = 3;
    } else if (input.brandCited) {
        base = 2;
    } else {
        base = 1;
    }

    const beforeAllCompetitors = input.competitorPositions.every(
        (pos) => input.brandFirstPosition! < pos,
    );
    const bonus = beforeAllCompetitors ? 1 : 0;

    return Math.min(4, base + bonus);
}
