/**
 * Prompt similarity — lightweight duplicate detection for the create flow.
 *
 * Requirement 16.2: warn (do not block) when a new prompt is substantially
 * similar (>80% overlap) to an existing active prompt.
 *
 * This is a deliberately simple token-Jaccard implementation with no external
 * dependencies. The spec's full TF-IDF + cosine approach (task 8.9) is a later
 * refinement; Jaccard is a good, cheap proxy for an MVP warning and never
 * blocks creation.
 */

export const DEFAULT_SIMILARITY_THRESHOLD = 0.8;

/** Lowercase, strip punctuation, split into a set of word tokens. */
function tokenize(text: string): Set<string> {
    return new Set(
        text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(Boolean),
    );
}

/**
 * Jaccard similarity between two strings' word sets: |A ∩ B| / |A ∪ B|.
 * Returns a value in [0, 1]. Two empty strings are considered identical (1).
 */
export function jaccardSimilarity(a: string, b: string): number {
    const setA = tokenize(a);
    const setB = tokenize(b);

    if (setA.size === 0 && setB.size === 0) return 1;
    if (setA.size === 0 || setB.size === 0) return 0;

    let intersection = 0;
    setA.forEach((token) => {
        if (setB.has(token)) intersection++;
    });
    const union = setA.size + setB.size - intersection;
    return intersection / union;
}

export interface SimilarPrompt {
    id: string;
    text: string;
    similarity: number;
}

/**
 * Find the most similar existing prompt above the threshold, if any.
 *
 * Returns the single highest-scoring match at or above `threshold`, or null
 * when nothing is similar enough. The caller surfaces this as a non-blocking
 * warning (Req 16.2).
 */
export function findSimilarPrompt(
    text: string,
    existing: { id: string; text: string }[],
    threshold: number = DEFAULT_SIMILARITY_THRESHOLD,
): SimilarPrompt | null {
    let best: SimilarPrompt | null = null;

    for (const candidate of existing) {
        const score = jaccardSimilarity(text, candidate.text);
        if (score >= threshold && (best === null || score > best.similarity)) {
            best = { id: candidate.id, text: candidate.text, similarity: score };
        }
    }

    return best;
}
