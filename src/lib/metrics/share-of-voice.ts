/**
 * Share-of-voice computation for the Metric_Engine.
 *
 * Share of voice answers "of all the AI mentions captured across the monitored
 * brand and its configured competitors, what slice belongs to each entity?"
 * It is a simple proportional metric: an entity's share is its mention count
 * divided by the total mention count across every entity, expressed as a
 * percentage (0-100).
 *
 * Every function here is a PURE FUNCTION — identical inputs always produce
 * identical outputs and there are no side effects (no DB, no clock, no I/O).
 * The zero-total case is handled explicitly so there is never a divide-by-zero:
 * when no entity has any mentions, every share is 0.
 *
 * Validates: Requirement 17.4 (share of voice: the brand's mention percentage
 *            relative to all configured competitors across all prompts)
 */

/** The kind of entity a mention count belongs to. */
export type EntityType = 'brand' | 'competitor';

/**
 * Total mentions captured for a single entity (the monitored brand or one
 * configured competitor) across all prompts being summarised.
 */
export interface EntityMentionCount {
    /** Identifier of the entity these mentions belong to. */
    entityId: string;
    /** Whether the entity is the monitored brand or a competitor. */
    entityType: EntityType;
    /** Number of mentions captured for this entity (expected >= 0). */
    mentionCount: number;
}

/**
 * One entity's share of the total mentions.
 */
export interface ShareOfVoice {
    /** Identifier of the entity. */
    entityId: string;
    /** Whether the entity is the monitored brand or a competitor. */
    entityType: EntityType;
    /** Mentions captured for this entity. */
    mentionCount: number;
    /**
     * This entity's percentage (0-100, one decimal) of the total mentions
     * across all entities. 0 when there are no mentions at all.
     */
    sharePercent: number;
}

/** Round to a given number of decimal places without floating-point noise. */
function roundTo(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

/** Sum of every entity's mention count across the input set. */
function totalMentions(counts: EntityMentionCount[]): number {
    return counts.reduce((sum, c) => sum + c.mentionCount, 0);
}

/**
 * Compute the share of voice for every entity. Each entity's share is its
 * mention count divided by the total mentions across all entities, as a
 * percentage rounded to one decimal place. Input order is preserved so the
 * output is deterministic, and there is exactly one output entry per input
 * entity.
 *
 * When the total is zero (no entity has any mentions) every share is 0,
 * avoiding a divide-by-zero. Otherwise, individual shares sum to ~100 (exact
 * equality is not guaranteed because each share is independently rounded).
 *
 * Validates: Requirement 17.4
 */
export function computeShareOfVoice(
    counts: EntityMentionCount[]
): ShareOfVoice[] {
    const total = totalMentions(counts);
    return counts.map((c) => ({
        entityId: c.entityId,
        entityType: c.entityType,
        mentionCount: c.mentionCount,
        sharePercent: total === 0 ? 0 : roundTo((c.mentionCount / total) * 100, 1),
    }));
}

/**
 * The monitored brand's share of voice percentage (0-100). Finds the entity
 * whose `entityType` is 'brand' and returns its share. Returns 0 when there is
 * no brand entity, when the brand has no mentions, or when there are no
 * mentions at all.
 *
 * Validates: Requirement 17.4
 */
export function brandShareOfVoice(counts: EntityMentionCount[]): number {
    const shares = computeShareOfVoice(counts);
    const brand = shares.find((s) => s.entityType === 'brand');
    return brand === undefined ? 0 : brand.sharePercent;
}
