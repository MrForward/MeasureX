/**
 * Typed wrapper around the `fast-levenshtein` package.
 *
 * `fast-levenshtein` is a CommonJS module whose default export exposes a
 * `get(a, b)` method. This wrapper hides that detail behind a small, clean,
 * pure functional interface used by the fuzzy matcher.
 *
 * Both functions are pure and deterministic.
 *
 * Validates: Requirement 5.2 (fuzzy matching to detect partial/variant mentions)
 */

import levenshtein from 'fast-levenshtein';

/**
 * Compute the Levenshtein (edit) distance between two strings: the minimum
 * number of single-character insertions, deletions, or substitutions required
 * to turn `a` into `b`.
 *
 * Returns a non-negative integer. The comparison is case-sensitive; callers
 * that want case-insensitive behaviour should normalize casing first.
 */
export function editDistance(a: string, b: string): number {
    return levenshtein.get(a, b);
}

/**
 * Compute a normalized similarity score in the range [0, 1] derived from the
 * edit distance, where 1 means the strings are identical and 0 means maximally
 * different (relative to the longer string's length).
 *
 * similarity = 1 - distance / max(len(a), len(b))
 *
 * Two empty strings are defined to be identical (similarity 1).
 */
export function similarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) {
        return 1;
    }
    const distance = editDistance(a, b);
    return 1 - distance / maxLen;
}
