/**
 * Extraction-specific type definitions for the entity extraction pipeline.
 *
 * These types describe the inputs and outputs of the matching stages
 * (exact match, fuzzy match) that detect brand and competitor mentions
 * within raw AI engine responses.
 *
 * Validates: Requirement 5.1 (exact match of brand name, aliases, competitor names)
 * Validates: Requirement 17 (competitor intelligence — disambiguation, false-positive avoidance)
 */

export type EntityType = 'brand' | 'competitor';

export type MatchType = 'exact' | 'fuzzy';

/**
 * An entity that can be matched within a response.
 *
 * Built from a Brand_Profile (type = 'brand') or a competitor configuration
 * (type = 'competitor'). `name` is the primary display name and `aliases`
 * holds alternative names / disambiguation strings (Requirement 17.1).
 */
export interface MatchableEntity {
    /** Brand profile ID or competitor ID. */
    id: string;
    /** Whether this entity is the monitored brand or a configured competitor. */
    type: EntityType;
    /** Primary name (e.g., "HubSpot", "Zoho CRM"). */
    name: string;
    /** Alternative names / aliases (e.g., ["Hubspot", "hubspot"]). */
    aliases: string[];
    /** Base domain used for citation matching (e.g., "hubspot.com"). */
    domain: string;
}

/**
 * A single detected mention of an entity within a response.
 *
 * Exact matches are recorded with `matchType = 'exact'` and `confidence = 1.0`
 * (Requirement 5.6, design Property 8). Fuzzy matches (added in task 3.2) use
 * `matchType = 'fuzzy'` with a confidence in the range 0.5-0.9.
 */
export interface EntityMatch {
    /** ID of the matched entity (brand profile ID or competitor ID). */
    entityId: string;
    /** Whether the matched entity is the brand or a competitor. */
    entityType: EntityType;
    /** The exact substring found in the response text. */
    matchedText: string;
    /** How the match was produced. */
    matchType: MatchType;
    /** Match certainty in the range 0-1. Exact matches are always 1.0. */
    confidence: number;
    /** Zero-based character index in the response where the match starts. */
    position: number;
}
