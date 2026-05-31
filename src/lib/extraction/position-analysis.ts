/**
 * Mention position analysis.
 *
 * Determines where in an AI engine response a mention falls by splitting the
 * response text into three equal thirds (by character count) and classifying a
 * character index as 'first', 'middle', or 'last'.
 *
 * Earlier mentions are more visible, so the visibility score rewards them:
 * first third = 100%, middle third = 66%, last third = 33% (design Factor 2).
 *
 * All functions here are pure and deterministic — no I/O, no time dependence,
 * no randomness.
 *
 * Validates: Requirement 5.5 (record mention position: first, middle, last third)
 * Validates: Requirement 6.1 (position factor: first=100%, middle=66%, last=33%)
 */

import type { MentionPosition } from '../../types';
import type { EntityMatch } from './types';

/**
 * Determine which third of the text a character position falls into.
 *
 * The text is split into three equal-width thirds by character count:
 * - `[0, textLength / 3)`            → 'first'
 * - `[textLength / 3, 2 * textLength / 3)` → 'middle'
 * - `[2 * textLength / 3, textLength]`     → 'last'
 *
 * Edge cases:
 * - `textLength <= 0` → `null` (there is no text to position within).
 * - `charIndex` outside `[0, textLength]` is clamped into range before
 *   classification (negative → start, beyond the end → last third).
 */
export function getPositionThird(charIndex: number, textLength: number): MentionPosition {
    if (textLength <= 0) {
        return null;
    }

    // Clamp the index into the valid span so out-of-bounds inputs degrade
    // gracefully rather than producing a misleading classification.
    const clamped = Math.min(Math.max(charIndex, 0), textLength);

    const firstBoundary = textLength / 3;
    const secondBoundary = (2 * textLength) / 3;

    if (clamped < firstBoundary) {
        return 'first';
    }
    if (clamped < secondBoundary) {
        return 'middle';
    }
    return 'last';
}

/**
 * Return the earliest (lowest character position) match from a list, or `null`
 * when the list is empty.
 *
 * Ties (matches sharing the same start position) resolve to the first such
 * match encountered, which keeps the result deterministic.
 */
export function getEarliestMatch(matches: EntityMatch[]): EntityMatch | null {
    let earliest: EntityMatch | null = null;

    for (const match of matches) {
        if (earliest === null || match.position < earliest.position) {
            earliest = match;
        }
    }

    return earliest;
}

/**
 * Given the brand's matches within a response, return the position (first /
 * middle / last third) of the earliest brand mention.
 *
 * Only the earliest mention matters for scoring: the position factor rewards
 * brands that appear sooner in the response.
 *
 * Returns `null` when the brand is not mentioned (`brandMatches` is empty) or
 * when the text has no length to position within.
 */
export function getBrandMentionPosition(
    brandMatches: EntityMatch[],
    textLength: number,
): MentionPosition {
    const earliest = getEarliestMatch(brandMatches);
    if (earliest === null) {
        return null;
    }

    return getPositionThird(earliest.position, textLength);
}
