/**
 * Fuzzy-match entity extraction.
 *
 * The second stage of the algorithmic extraction pipeline ("algorithmic first,
 * LLM second"). After {@link findExactMatches} captures verbatim mentions, this
 * stage catches near-misses — typos and minor variants — using bounded
 * Levenshtein (edit) distance.
 *
 * The matcher is deliberately conservative to honour Requirement 17 (avoid
 * false positives):
 *   - only edit distances of 1 or 2 are accepted (distance 0 is an exact match,
 *     handled by the exact matcher);
 *   - a matched token must be at least 80% as long as the entity name it
 *     matches, so a short token cannot "fuzzily" become a long name;
 *   - entity names shorter than 4 characters are not fuzzy-matched at all
 *     (short names like "AC" produce too many false positives and require an
 *     exact match).
 *
 * This is a pure, deterministic function with no side effects. Tunable
 * thresholds are read from {@link CONFIG_DEFAULTS} so they can later be promoted
 * to runtime configuration without changing this code.
 *
 * Validates: Requirement 5.2 (fuzzy matching to detect partial/variant mentions)
 * Validates: Requirement 5.6 / design Property 8 (fuzzy → confidence 0.5-0.9)
 * Validates: Requirement 17 (80% length rule + 4-char minimum to avoid false positives)
 */

import { CONFIG_DEFAULTS } from '@/lib/config/defaults';
import { editDistance } from './levenshtein';
import type { EntityMatch, MatchableEntity } from './types';

/** Maximum Levenshtein distance accepted for a fuzzy match. */
const MAX_EDIT_DISTANCE = 2;

/**
 * Minimum length (in characters) an entity name must have to be eligible for
 * fuzzy matching. Shorter names require an exact match.
 */
const MIN_NAME_LENGTH = 4;

/** Largest n-gram (in words) assembled from the text when matching names. */
const MAX_NGRAM = 3;

/** Confidence subtracted per unit of edit distance. */
const CONFIDENCE_PENALTY_PER_EDIT = 0.175;

/** Confidence bounds — fuzzy confidence is always below an exact match's 1.0. */
const MIN_CONFIDENCE = 0.5;
const MAX_CONFIDENCE = 0.9;

/**
 * Minimum fraction of an entity name's length that a matched token must reach.
 * Read from platform config defaults ('extraction.fuzzy_min_length_pct' = 0.8).
 */
const MIN_LENGTH_PCT =
    typeof CONFIG_DEFAULTS['extraction.fuzzy_min_length_pct']?.value === 'number'
        ? (CONFIG_DEFAULTS['extraction.fuzzy_min_length_pct'].value as number)
        : 0.8;

interface Word {
    text: string;
    start: number;
    /** Exclusive end index in the source text. */
    end: number;
}

interface CandidateMatch extends EntityMatch {
    /** Exclusive end index of the match in the source text. */
    end: number;
    /** Edit distance that produced this match (used for ranking). */
    distance: number;
}

/**
 * Split text into word tokens, tracking each token's character offsets.
 *
 * A token is a run of alphanumerics that may contain internal punctuation found
 * in real product names (".", "&", "'", "+", "-") but must begin and end with
 * an alphanumeric character. This keeps "Monday.com" intact while stripping
 * trailing punctuation such as the comma in "HubSpot,".
 */
function tokenize(text: string): Word[] {
    const words: Word[] = [];
    const pattern = /[A-Za-z0-9][A-Za-z0-9.&'+-]*[A-Za-z0-9]|[A-Za-z0-9]/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
        words.push({
            text: match[0],
            start: match.index,
            end: match.index + match[0].length,
        });
    }

    return words;
}

/**
 * Return the unique, trimmed, non-empty set of searchable strings for an entity
 * (its primary name plus aliases) that are long enough to fuzzy-match.
 */
function fuzzyTermsFor(entity: MatchableEntity): string[] {
    const terms = [entity.name, ...entity.aliases]
        .filter((term): term is string => typeof term === 'string')
        .map((term) => term.trim())
        .filter((term) => term.length >= MIN_NAME_LENGTH);

    return Array.from(new Set(terms));
}

/** Clamp a value into the inclusive [min, max] range. */
function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * Confidence for a fuzzy match given its edit distance:
 *   confidence = 1 - distance * 0.175, clamped to [0.5, 0.9]
 *
 * distance 1 → ~0.83, distance 2 → 0.65. The clamp guarantees a fuzzy match is
 * never reported with the certainty of an exact (1.0) match.
 */
function confidenceForDistance(distance: number): number {
    return clamp(1 - distance * CONFIDENCE_PENALTY_PER_EDIT, MIN_CONFIDENCE, MAX_CONFIDENCE);
}

/**
 * Find fuzzy (typo / minor-variant) mentions of the supplied entities within
 * `text`.
 *
 * @param text              Raw response text to search.
 * @param entities          Brand / competitor entities to look for.
 * @param excludePositions  Start positions already claimed by exact matches.
 *                          Any fuzzy match beginning at one of these positions
 *                          is suppressed to avoid double-counting.
 *
 * Behaviour:
 * - Case-insensitive matching; the reported `matchedText` preserves original
 *   casing from the response.
 * - Matches single-word and multi-word names (1- to 3-grams) so "Zoho CRM" can
 *   be detected even with a typo.
 * - Distance-0 (exact) matches are skipped — they belong to the exact matcher.
 * - Each match has `matchType: 'fuzzy'` and a confidence in [0.5, 0.9].
 * - Overlapping candidates are resolved longest/best-first, so a single mention
 *   yields a single match.
 *
 * Results are ordered by their start position in the text.
 */
export function findFuzzyMatches(
    text: string,
    entities: MatchableEntity[],
    excludePositions?: number[],
): EntityMatch[] {
    if (!text || entities.length === 0) {
        return [];
    }

    const excluded = new Set(excludePositions ?? []);
    const words = tokenize(text);
    const candidates: CandidateMatch[] = [];

    for (const entity of entities) {
        const terms = fuzzyTermsFor(entity);
        if (terms.length === 0) continue;

        for (let n = 1; n <= MAX_NGRAM; n += 1) {
            for (let i = 0; i + n <= words.length; i += 1) {
                const first = words[i];
                const last = words[i + n - 1];
                const ngramText = text.slice(first.start, last.end);
                const position = first.start;

                if (excluded.has(position)) continue;

                const ngramLower = ngramText.toLowerCase();

                for (const term of terms) {
                    // 80% length rule: a short token cannot match a long name.
                    if (ngramText.length < term.length * MIN_LENGTH_PCT) continue;

                    const distance = editDistance(ngramLower, term.toLowerCase());

                    // distance 0 → exact (handled elsewhere); too far → reject.
                    if (distance === 0 || distance > MAX_EDIT_DISTANCE) continue;

                    candidates.push({
                        entityId: entity.id,
                        entityType: entity.type,
                        matchedText: ngramText,
                        matchType: 'fuzzy',
                        confidence: confidenceForDistance(distance),
                        position,
                        end: last.end,
                        distance,
                    });
                }
            }
        }
    }

    return resolveOverlaps(candidates);
}

/**
 * Resolve overlapping fuzzy candidates. Candidates are ordered by start
 * position, then by best quality (lowest edit distance, then longest span), and
 * accepted greedily so that no two returned matches overlap. This collapses the
 * several n-gram / alias candidates that a single mention can generate into one
 * match.
 */
function resolveOverlaps(candidates: CandidateMatch[]): EntityMatch[] {
    const sorted = [...candidates].sort((a, b) => {
        if (a.position !== b.position) return a.position - b.position;
        // Prefer the closer (lower-distance) match first.
        if (a.distance !== b.distance) return a.distance - b.distance;
        // Then prefer the longer span.
        const lengthDiff = b.end - b.position - (a.end - a.position);
        if (lengthDiff !== 0) return lengthDiff;
        // Stable, deterministic tiebreaker.
        if (a.entityType !== b.entityType) return a.entityType < b.entityType ? -1 : 1;
        return a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0;
    });

    const accepted: CandidateMatch[] = [];
    let lastAcceptedEnd = -1;

    for (const candidate of sorted) {
        if (candidate.position >= lastAcceptedEnd) {
            accepted.push(candidate);
            lastAcceptedEnd = candidate.end;
        }
    }

    return accepted
        .sort((a, b) => a.position - b.position)
        .map(({ end: _end, distance: _distance, ...rest }) => rest);
}
