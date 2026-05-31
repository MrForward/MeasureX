/**
 * Exact-match entity extraction.
 *
 * Finds case-insensitive, word-boundary-aware occurrences of configured brand
 * and competitor names (and their aliases) within a raw AI engine response.
 *
 * This is the first, cheapest stage of the entity extraction pipeline
 * ("algorithmic first, LLM second"). It is implemented as a pure, deterministic
 * function with no side effects.
 *
 * Validates: Requirement 5.1 (exact match of brand name, aliases, competitor names)
 * Validates: Requirement 5.6 / design Property 8 (exact matches → confidence 1.0)
 * Validates: Requirement 17 (avoid false positives via word boundaries; longest-match-first)
 */

import { EXACT_MATCH_CONFIDENCE } from './confidence';
import type { EntityMatch, MatchableEntity } from './types';

/**
 * Escape characters that carry special meaning inside a regular expression so
 * that an entity name is matched literally.
 *
 * For example "Monday.com" must match a literal dot, not "any character", and
 * names containing parentheses or "+" must not corrupt the compiled pattern.
 */
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a global, case-insensitive regular expression that matches `phrase`
 * only when it is not directly adjacent to an alphanumeric character.
 *
 * Using explicit alphanumeric look-arounds (rather than `\b`) keeps the
 * boundary semantics predictable for names containing punctuation such as
 * "Monday.com": "Force" will not match inside "Salesforce" and "hub" will not
 * match inside "GitHub", but "Monday.com" still matches as a standalone token.
 */
function buildPattern(phrase: string): RegExp {
    const escaped = escapeRegExp(phrase);
    return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'gi');
}

interface CandidateMatch extends EntityMatch {
    /** Exclusive end index of the match in the source text. */
    end: number;
}

/**
 * Return the unique, non-empty set of searchable strings for an entity:
 * its primary name plus all aliases. Blank/whitespace-only values are dropped
 * (an empty pattern would otherwise match everywhere).
 */
function searchTermsFor(entity: MatchableEntity): string[] {
    const terms = [entity.name, ...entity.aliases]
        .filter((term): term is string => typeof term === 'string')
        .map((term) => term.trim())
        .filter((term) => term.length > 0);

    return Array.from(new Set(terms));
}

/**
 * Find all exact matches of the supplied entities' names and aliases within
 * `text`.
 *
 * Behaviour:
 * - Case-insensitive ("HubSpot" === "hubspot" === "HUBSPOT").
 * - Word-boundary aware ("Force" does not match inside "Salesforce").
 * - Matches the primary name and every alias.
 * - Matches multi-word / punctuated names verbatim ("Zoho CRM", "Monday.com").
 * - Returns every occurrence; a name appearing multiple times yields multiple
 *   matches.
 * - Every returned match has `matchType: 'exact'` and `confidence: 1`.
 * - Longest-match-first: when matches overlap (e.g. "Zoho CRM" and "Zoho" at
 *   the same position), the longer match wins and the shorter is discarded.
 *
 * Results are ordered by their start position in the text.
 */
export function findExactMatches(text: string, entities: MatchableEntity[]): EntityMatch[] {
    if (!text || entities.length === 0) {
        return [];
    }

    const candidates: CandidateMatch[] = [];

    for (const entity of entities) {
        for (const term of searchTermsFor(entity)) {
            const pattern = buildPattern(term);
            let match: RegExpExecArray | null;

            while ((match = pattern.exec(text)) !== null) {
                const start = match.index;
                const end = start + match[0].length;

                candidates.push({
                    entityId: entity.id,
                    entityType: entity.type,
                    matchedText: text.slice(start, end),
                    matchType: 'exact',
                    confidence: EXACT_MATCH_CONFIDENCE,
                    position: start,
                    end,
                });

                // Guard against pathological zero-length matches (defensive —
                // empty terms are already filtered out).
                if (match.index === pattern.lastIndex) {
                    pattern.lastIndex += 1;
                }
            }
        }
    }

    return resolveOverlaps(candidates);
}

/**
 * Apply a longest-match-first strategy: order candidates by start position and,
 * for matches sharing a start, by descending length. Greedily accept matches
 * that do not overlap an already-accepted span, discarding shorter overlapping
 * matches (e.g. "Zoho" inside "Zoho CRM").
 */
function resolveOverlaps(candidates: CandidateMatch[]): EntityMatch[] {
    const sorted = [...candidates].sort((a, b) => {
        if (a.position !== b.position) return a.position - b.position;
        // Longer match first when starting at the same position.
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
        // Otherwise this candidate overlaps an already-accepted (longer or
        // earlier) match and is discarded.
    }

    return accepted.map(({ end: _end, ...rest }) => rest);
}
