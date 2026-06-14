/**
 * Mention-position ranking (PRD §F5b).
 *
 * The PRD ranks entities by the ORDER in which they first appear in the
 * response (1st / 2nd / 3rd …), based on each entity's first-mention character
 * offset — NOT by which "third" of the text the mention falls in.
 *
 * Given each detected entity's `firstMentionPosition`, this module sorts the
 * detected entities by offset (ascending) and assigns rank 1, 2, 3, …
 * Entities with no mention (null offset) receive rank `null`.
 *
 * Pure and deterministic.
 */

/** An entity paired with its first-mention character offset (null if absent). */
export interface RankableEntity {
    id: string;
    firstMentionPosition: number | null;
}

/**
 * Assign a 1-based rank to each entity by ascending first-mention offset.
 *
 * Returns a map of entity id → rank (1 = earliest mention), with `null` for any
 * entity that was not mentioned. Ties (equal offsets) are broken by input order,
 * keeping the result deterministic.
 */
export function rankByPosition(
    entities: RankableEntity[],
): Map<string, number | null> {
    const ranks = new Map<string, number | null>();

    const mentioned = entities
        .filter(
            (e): e is { id: string; firstMentionPosition: number } =>
                e.firstMentionPosition !== null,
        )
        // Stable sort by offset; equal offsets keep their original order.
        .map((e, index) => ({ ...e, index }))
        .sort((a, b) =>
            a.firstMentionPosition !== b.firstMentionPosition
                ? a.firstMentionPosition - b.firstMentionPosition
                : a.index - b.index,
        );

    // Absent entities first → rank null.
    for (const entity of entities) {
        if (entity.firstMentionPosition === null) {
            ranks.set(entity.id, null);
        }
    }

    mentioned.forEach((entity, i) => {
        ranks.set(entity.id, i + 1);
    });

    return ranks;
}
