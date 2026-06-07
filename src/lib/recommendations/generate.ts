/**
 * Recommendation generation — evidence-backed, prioritized suggestions.
 *
 * This is the algorithmic core: given the per-prompt performance and the brand's
 * share of voice, it derives actionable recommendations (gaps, citation
 * opportunities, competitive pressure) with an impact level and confidence.
 *
 * It is a PURE FUNCTION — no LLM, no I/O — so it works in DEMO_MODE without API
 * keys and is fully unit-testable. A higher-quality LLM rewrite of the `action`
 * text (Claude Sonnet / GPT-4o per design) is a later enhancement that can wrap
 * these drafts.
 *
 * Validates: Requirement 8.1 (recommendations from visibility gaps, competitor
 *            advantages, citation patterns), 8.2 (evidence + action + impact +
 *            confidence), 8.3 (prioritized by impact), 17.4 (share-of-voice gap)
 */

import type { ImpactLevel } from '@/types';

export interface PromptPerformance {
    promptId: string;
    text: string;
    visibilityScore: number;
    mentionCount: number;
    citationRate: number;
}

export interface RecommendationInput {
    brandName: string;
    /** Brand's share of voice (0-100) across the run. */
    brandShareOfVoice: number;
    prompts: PromptPerformance[];
}

export interface RecommendationDraft {
    evidenceText: string;
    action: string;
    impactLevel: ImpactLevel;
    confidence: number;
    /** The prompt this targets, or null for a workspace-level recommendation. */
    promptId: string | null;
}

// Thresholds (sensible defaults; could move to platform_config later).
const VISIBILITY_LOW = 40;
const VISIBILITY_OK = 70;
const SOV_LOW = 30;
const MAX_RECOMMENDATIONS = 6;

const IMPACT_RANK: Record<ImpactLevel, number> = { high: 3, medium: 2, low: 1 };

/**
 * Generate prioritized recommendations. Returns at most MAX_RECOMMENDATIONS,
 * highest-impact first (ties broken by confidence).
 */
export function generateRecommendations(
    input: RecommendationInput,
): RecommendationDraft[] {
    const drafts: RecommendationDraft[] = [];

    // ── Workspace-level: share of voice ──────────────────────────────────────
    if (input.brandShareOfVoice < SOV_LOW) {
        const competitorShare = Math.round(100 - input.brandShareOfVoice);
        drafts.push({
            evidenceText: `${input.brandName} holds only ${input.brandShareOfVoice}% share of voice — competitors capture the remaining ${competitorShare}% of AI mentions.`,
            action: `Prioritize content on your highest-intent prompts to grow ${input.brandName}'s share of voice against competitors.`,
            impactLevel: 'high',
            confidence: 0.75,
            promptId: null,
        });
    }

    // ── Per-prompt rules ─────────────────────────────────────────────────────
    for (const p of input.prompts) {
        if (p.mentionCount === 0 || p.visibilityScore === 0) {
            drafts.push({
                evidenceText: `${input.brandName} did not appear in AI answers for "${p.text}".`,
                action: `Create authoritative, well-structured content targeting "${p.text}" to establish presence.`,
                impactLevel: 'high',
                confidence: 0.9,
                promptId: p.promptId,
            });
        } else if (p.visibilityScore < VISIBILITY_LOW) {
            drafts.push({
                evidenceText: `"${p.text}" scored only ${p.visibilityScore}/100 — ${input.brandName} appears weakly or late in answers.`,
                action: `Strengthen topical authority for "${p.text}" so ${input.brandName} is mentioned earlier and more prominently.`,
                impactLevel: 'high',
                confidence: 0.8,
                promptId: p.promptId,
            });
        } else if (p.citationRate === 0) {
            drafts.push({
                evidenceText: `${input.brandName} is mentioned for "${p.text}" but your domain is never cited as a source.`,
                action: `Publish a definitive, linkable resource for "${p.text}" so engines cite your site directly.`,
                impactLevel: 'medium',
                confidence: 0.7,
                promptId: p.promptId,
            });
        } else if (p.visibilityScore < VISIBILITY_OK) {
            drafts.push({
                evidenceText: `"${p.text}" scored ${p.visibilityScore}/100 — solid but with room to improve.`,
                action: `Add comparison and recommendation-strength framing to your "${p.text}" content to lift the score.`,
                impactLevel: 'low',
                confidence: 0.6,
                promptId: p.promptId,
            });
        }
        // Prompts scoring >= VISIBILITY_OK are performing well — no action needed.
    }

    return drafts
        .sort(
            (a, b) =>
                IMPACT_RANK[b.impactLevel] - IMPACT_RANK[a.impactLevel] ||
                b.confidence - a.confidence,
        )
        .slice(0, MAX_RECOMMENDATIONS);
}
