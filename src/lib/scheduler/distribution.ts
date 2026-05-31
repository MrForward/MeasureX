/**
 * Run distribution logic — spreads workspace runs across a time window
 * so they don't all execute simultaneously (avoiding API rate limit spikes).
 *
 * Validates: Requirement 20.4 (distribute scheduled runs across the week)
 *
 * Approach: Each workspace gets a deterministic delay based on a hash of its ID.
 * This ensures the same workspace always lands in the same time slot, making
 * the schedule predictable and idempotent across scheduler invocations.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DistributedWorkspace {
    workspaceId: string;
    delayMs: number;
    scheduledAt: Date;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default distribution window: 24 hours (keeps results fresh for MVP) */
const DEFAULT_WINDOW_MS = 86_400_000;

// ── Hash Function ─────────────────────────────────────────────────────────────

/**
 * Simple deterministic hash of a string to a non-negative integer.
 * Uses djb2 algorithm — fast, good distribution, no crypto dependency.
 */
export function hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        // hash * 33 + charCode
        hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
    }
    return hash;
}

// ── Core Functions ────────────────────────────────────────────────────────────

/**
 * Compute a deterministic delay (in ms) for a workspace based on its ID.
 *
 * Distributes workspaces evenly across a time window. Uses a hash of the
 * workspace ID to assign a stable slot within the window.
 *
 * @param workspaceId     - Unique workspace identifier
 * @param totalWorkspaces - Total number of workspaces being distributed
 * @param windowMs        - Distribution window in milliseconds (default: 24h)
 * @returns Delay in milliseconds, in range [0, windowMs)
 */
export function computeRunDelay(
    workspaceId: string,
    totalWorkspaces: number,
    windowMs: number = DEFAULT_WINDOW_MS,
): number {
    if (totalWorkspaces <= 0) {
        return 0;
    }

    const hash = hashString(workspaceId);
    const slotSize = windowMs / totalWorkspaces;
    const slotIndex = hash % totalWorkspaces;

    return Math.floor(slotIndex * slotSize);
}

/**
 * Compute the scheduled execution time for a workspace.
 *
 * @param workspaceId     - Unique workspace identifier
 * @param totalWorkspaces - Total number of workspaces being distributed
 * @param baseTime        - Start of the distribution window (default: now)
 * @returns Date when this workspace's jobs should start executing
 */
export function computeScheduledTime(
    workspaceId: string,
    totalWorkspaces: number,
    baseTime: Date = new Date(),
): Date {
    const delay = computeRunDelay(workspaceId, totalWorkspaces);
    return new Date(baseTime.getTime() + delay);
}

/**
 * Assign delays to a batch of workspaces, returning them sorted by delay ascending.
 *
 * @param workspaceIds - Array of workspace IDs to distribute
 * @param baseTime     - Start of the distribution window (default: now)
 * @param windowMs     - Distribution window in milliseconds (default: 24h)
 * @returns Array of DistributedWorkspace entries sorted by delay
 */
export function distributeWorkspaces(
    workspaceIds: string[],
    baseTime: Date = new Date(),
    windowMs: number = DEFAULT_WINDOW_MS,
): DistributedWorkspace[] {
    const totalWorkspaces = workspaceIds.length;

    if (totalWorkspaces === 0) {
        return [];
    }

    const distributed: DistributedWorkspace[] = workspaceIds.map((workspaceId) => {
        const delayMs = computeRunDelay(workspaceId, totalWorkspaces, windowMs);
        return {
            workspaceId,
            delayMs,
            scheduledAt: new Date(baseTime.getTime() + delayMs),
        };
    });

    // Sort by delay ascending
    distributed.sort((a, b) => a.delayMs - b.delayMs);

    return distributed;
}
