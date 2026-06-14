/**
 * Scan-over-scan delta (PRD §F6 "Delta calculation").
 *
 * The MVP delta is intentionally simple: `current - previous`. If no previous
 * scan exists, the delta is `null` (the dashboard shows "First scan").
 *
 * Pure and deterministic.
 */

/**
 * Compute the delta between the current scan's score and the previous scan's.
 *
 * @param currentScore  the latest scan's overall visibility score (0-100).
 * @param previousScore the prior scan's score, or `null`/`undefined` when this
 *                      is the first-ever scan.
 * @returns `current - previous`, or `null` when there is no previous scan.
 */
export function computeDelta(
    currentScore: number,
    previousScore: number | null | undefined,
): number | null {
    if (previousScore === null || previousScore === undefined) {
        return null;
    }
    return currentScore - previousScore;
}
