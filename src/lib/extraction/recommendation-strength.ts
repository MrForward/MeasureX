/**
 * Recommendation-strength language detection.
 *
 * Classifies how strongly an AI engine response recommends a detected brand
 * mention. The result feeds Factor 3 of the visibility score:
 *   - 'explicit' → explicit recommendation  (scores 100%)
 *   - 'neutral'  → neutral listing / mention (scores 50%)
 *   - 'none'     → no mention                (scores 0%)
 *
 * Following the platform's "algorithmic first, LLM second" rule (and the token
 * burn protection guardrail), detection runs in two stages:
 *
 *   1. A pure, deterministic RULE-BASED fast path that scans a small context
 *      window around the mention for recommendation / negative keywords. This
 *      is free, instant, and handles the vast majority of cases.
 *   2. A LLM FALLBACK that is only consulted when the rules are inconclusive
 *      AND a classifier is supplied. At most ONE LLM call is ever made per
 *      mention (token burn protection). The LLM response is validated and a
 *      safe default ('neutral') is returned for anything unexpected — this
 *      path never throws.
 *
 * Note on sentiment: detecting that a brand is mentioned negatively (e.g.
 * "avoid X") is out of scope for V1 sentiment analysis. A negative mention is
 * still a mention, but it is NOT a recommendation, so it is classified as
 * 'neutral' rather than 'explicit'.
 *
 * Validates: Requirement 5.8 (detect recommendation-strength language such as
 *   "recommended", "best option", "top choice" associated with brand mentions)
 * Validates: Requirement 6.1 (recommendation factor: explicit recommendation =
 *   100%, neutral mention = 50%, no mention = 0%)
 */

import type { RecommendationStrength } from '@/types';

/**
 * Half-width (in characters) of the context window examined around a mention.
 * The rules inspect roughly this many characters before the mention and after
 * it, so signals like "I recommend HubSpot" or "HubSpot is the best CRM" are
 * captured regardless of which side of the brand name they appear on.
 */
export const CONTEXT_WINDOW_CHARS = 100;

/**
 * Keywords that signal an EXPLICIT recommendation when found near a mention.
 * Matching is case-insensitive substring matching against the context window.
 */
export const EXPLICIT_KEYWORDS: readonly string[] = [
    'recommend',
    'best',
    'top choice',
    'top pick',
    'great option',
    'ideal',
    'go with',
    'our pick',
    'winner',
    'leading',
    '#1',
    'number one',
];

/**
 * Keywords that signal a NEGATIVE framing. A negative mention is a clear,
 * conclusive signal — but because it is not a recommendation it resolves to
 * 'neutral' for V1 (sentiment analysis is out of scope). These are checked
 * BEFORE the explicit keywords so that phrases like "not recommended" are not
 * misread as an explicit recommendation (they contain the substring
 * "recommend").
 */
export const NEGATIVE_KEYWORDS: readonly string[] = [
    'avoid',
    "don't use",
    'do not use',
    'not recommended',
    'worst',
    'stay away',
];

/** The set of valid strength values an LLM is allowed to return. */
const VALID_STRENGTHS: ReadonlySet<RecommendationStrength> = new Set<RecommendationStrength>([
    'explicit',
    'neutral',
    'none',
]);

/**
 * Minimal interface the LLM-based fallback depends on. Keeping this narrow and
 * injectable means tests can supply a mock classifier — no real API calls and
 * no network access in unit tests.
 */
export interface LLMClassifier {
    /** Send a classification prompt and resolve with the model's raw text reply. */
    classify(prompt: string): Promise<string>;
}

/** Outcome of the rule-based fast path. */
export interface RuleBasedResult {
    /** The strength inferred from keyword heuristics. */
    strength: RecommendationStrength;
    /**
     * Whether the rules found a clear keyword signal. `true` when an explicit
     * or negative keyword matched; `false` when the mention exists but no
     * strong signal was found (an ambiguous case the LLM could help with).
     */
    conclusive: boolean;
}

/** Extract a lower-cased context window of text surrounding a mention. */
function contextWindow(text: string, mentionPosition: number, mentionLength: number): string {
    const safePosition = Math.max(0, mentionPosition);
    const safeLength = Math.max(0, mentionLength);

    const start = Math.max(0, safePosition - CONTEXT_WINDOW_CHARS);
    const end = Math.min(text.length, safePosition + safeLength + CONTEXT_WINDOW_CHARS);

    return text.slice(start, end).toLowerCase();
}

/** True when any keyword in the list appears in the (already lower-cased) window. */
function containsAny(window: string, keywords: readonly string[]): boolean {
    return keywords.some((keyword) => window.includes(keyword.toLowerCase()));
}

/**
 * Rule-based detection (the fast path — no LLM, pure and deterministic).
 *
 * Examines a context window around the mention and applies keyword heuristics:
 *   - NEGATIVE keyword present  → 'neutral'  (conclusive: a clear, if negative, signal)
 *   - EXPLICIT keyword present  → 'explicit' (conclusive)
 *   - otherwise                 → 'neutral'  (inconclusive: the LLM could help)
 *
 * Negative keywords are checked first so "not recommended" is not mistaken for
 * an explicit recommendation.
 */
export function detectStrengthRuleBased(
    text: string,
    mentionPosition: number,
    mentionLength: number,
): RuleBasedResult {
    const window = contextWindow(text, mentionPosition, mentionLength);

    // Negative framing is a clear signal, but a negative mention is not a
    // recommendation → 'neutral'. Checked before explicit keywords because
    // phrases like "not recommended" contain the substring "recommend".
    if (containsAny(window, NEGATIVE_KEYWORDS)) {
        return { strength: 'neutral', conclusive: true };
    }

    if (containsAny(window, EXPLICIT_KEYWORDS)) {
        return { strength: 'explicit', conclusive: true };
    }

    // Mention exists but no strong signal — neutral, and ambiguous enough that
    // the LLM fallback may add value.
    return { strength: 'neutral', conclusive: false };
}

/** Build the focused classification prompt sent to the cheap LLM. */
export function buildClassificationPrompt(text: string, mentionText: string): string {
    return [
        'You classify how strongly an AI-generated response recommends a brand.',
        `Brand mention: "${mentionText}"`,
        '',
        'Response text:',
        text,
        '',
        'Classify the recommendation strength for the brand mention as exactly one of:',
        '- explicit: the response explicitly recommends the brand (e.g. "best", "top choice", "I recommend").',
        '- neutral: the brand is mentioned or listed without an explicit recommendation.',
        '- none: the brand is not recommended at all.',
        '',
        'Respond with ONLY one word: explicit, neutral, or none.',
    ].join('\n');
}

/** Normalize and validate a raw LLM reply into a RecommendationStrength. */
export function parseStrengthResponse(raw: string): RecommendationStrength {
    const normalized = raw.trim().toLowerCase() as RecommendationStrength;
    return VALID_STRENGTHS.has(normalized) ? normalized : 'neutral';
}

/**
 * LLM-based detection (the fallback). Only invoked when the rules are
 * inconclusive. Builds a focused prompt, asks the classifier for one of
 * explicit / neutral / none, and validates the reply.
 *
 * Safety: this function NEVER throws. Invalid output or a rejected/erroring
 * classifier both resolve to the safe default 'neutral'.
 */
export async function detectStrengthWithLLM(
    text: string,
    mentionText: string,
    classifier: LLMClassifier,
): Promise<RecommendationStrength> {
    try {
        const prompt = buildClassificationPrompt(text, mentionText);
        const raw = await classifier.classify(prompt);
        return parseStrengthResponse(raw);
    } catch {
        // Defensive: a misbehaving classifier must not break extraction.
        return 'neutral';
    }
}

/**
 * Combined entry point for recommendation-strength detection.
 *
 * 1. Runs the rule-based fast path.
 * 2. If the rules are conclusive, OR no classifier was supplied, returns the
 *    rule-based result immediately (zero LLM cost).
 * 3. Only when the rules are inconclusive AND a classifier is available does it
 *    consult the LLM — and it makes at most ONE call (token burn protection).
 *
 * @param text            the full response text the mention was found in.
 * @param mentionPosition zero-based character index where the mention starts.
 * @param mentionLength   length (in characters) of the matched mention text.
 * @param classifier      optional LLM classifier; when omitted, runs rules-only.
 */
export async function detectRecommendationStrength(
    text: string,
    mentionPosition: number,
    mentionLength: number,
    classifier?: LLMClassifier,
): Promise<RecommendationStrength> {
    const ruleResult = detectStrengthRuleBased(text, mentionPosition, mentionLength);

    if (ruleResult.conclusive || classifier === undefined) {
        return ruleResult.strength;
    }

    const safePosition = Math.max(0, mentionPosition);
    const safeLength = Math.max(0, mentionLength);
    const mentionText = text.slice(safePosition, safePosition + safeLength);

    return detectStrengthWithLLM(text, mentionText, classifier);
}
