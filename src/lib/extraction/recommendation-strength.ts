/**
 * Recommendation-strength detection (PRD §F5d) — rule-based only, no LLM.
 *
 * Classifies a detected brand mention as:
 *   - RECOMMENDED: a recommendation pattern matches and is NOT negated.
 *   - MENTIONED:   the brand is detected but no (un-negated) pattern matches.
 *   - ABSENT:      the brand is not detected at all.
 *
 * Pattern list is taken verbatim from PRD §F5d. Each `{brand}` slot is filled
 * with the configured brand name (regex-escaped, case-insensitive).
 *
 * Negation filter (PRD §F5d): for any matched pattern, the 10 characters
 * immediately preceding the match are scanned for a negation cue. If found, the
 * match is rejected (classified as MENTIONED, not RECOMMENDED).
 *
 * Pure and deterministic.
 */

import type { RecommendationStrength } from './types';

/** Recommendation pattern templates (PRD §F5d). `{B}` = brand name. */
const PATTERN_TEMPLATES: readonly string[] = [
    'I recommend {B}',
    '{B} is the best',
    'top pick is {B}',
    '{B} is ideal',
    "I'd suggest {B}",
    '{B} is my recommendation',
    'best option is {B}',
    '{B} stands out',
];

/**
 * Negation cues (PRD §F5d). If any appears in the 10 characters before a
 * matched recommendation pattern, the recommendation is downgraded to MENTIONED.
 */
const NEGATION_CUES: readonly string[] = [
    'not',
    "n't",
    "wouldn't",
    "don't",
    "shouldn't",
    'hardly',
    'barely',
    'no longer',
];

/** Width (chars) of the look-behind window scanned for negation cues. */
export const NEGATION_WINDOW_CHARS = 10;

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when the 10 chars preceding `matchStart` contain a negation cue. */
function isNegated(text: string, matchStart: number): boolean {
    const windowStart = Math.max(0, matchStart - NEGATION_WINDOW_CHARS);
    const window = text.slice(windowStart, matchStart).toLowerCase();
    return NEGATION_CUES.some((cue) => window.includes(cue));
}

/**
 * Classify recommendation strength for the brand within `text`.
 *
 * @param text      the raw AI response text.
 * @param brandName the brand's display name.
 * @param mentioned whether exact-match detected the brand (drives ABSENT).
 */
export function detectRecommendationStrength(
    text: string,
    brandName: string,
    mentioned: boolean,
): RecommendationStrength {
    if (!mentioned) {
        return 'ABSENT';
    }

    const trimmed = (brandName ?? '').trim();
    if (!text || trimmed.length === 0) {
        return 'MENTIONED';
    }

    const escaped = escapeRegExp(trimmed);

    for (const template of PATTERN_TEMPLATES) {
        const source = escapeRegExp(template)
            // Re-insert the brand sub-pattern where the `{B}` placeholder was
            // (the placeholder itself was escaped to `\{B\}`).
            .replace(/\\\{B\\\}/g, escaped);
        const pattern = new RegExp(source, 'gi');

        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
            if (!isNegated(text, match.index)) {
                return 'RECOMMENDED';
            }
            if (match.index === pattern.lastIndex) {
                pattern.lastIndex += 1;
            }
        }
    }

    return 'MENTIONED';
}
