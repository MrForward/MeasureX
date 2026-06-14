/**
 * Scan eligibility guard rails (PRD §F9).
 *
 * A manual scan is allowed only when:
 *   1. the subscription is active,
 *   2. no scan is already running, and
 *   3. the last scan started at least 1 hour ago (rate limit).
 *
 * Pure and deterministic — `now` is injected so it is testable.
 */

/** Minimum gap between manual scans (PRD §F9: max 1 scan per hour). */
export const SCAN_RATE_LIMIT_MS = 60 * 60 * 1000;

export type ScanBlockCode =
    | 'SUBSCRIPTION_INACTIVE'
    | 'SCAN_IN_PROGRESS'
    | 'RATE_LIMITED';

export interface ScanEligibilityInput {
    subscriptionStatus: string;
    hasRunningScan: boolean;
    /** When the most recent scan started, or null if none yet. */
    lastScanStartedAt: Date | null;
    now: Date;
}

export interface ScanEligibility {
    allowed: boolean;
    code?: ScanBlockCode;
    message?: string;
    /** For RATE_LIMITED: ms until a scan is permitted again. */
    retryAfterMs?: number;
}

/** Decide whether a manual scan may start. */
export function evaluateScanEligibility(input: ScanEligibilityInput): ScanEligibility {
    if (input.subscriptionStatus !== 'active') {
        return {
            allowed: false,
            code: 'SUBSCRIPTION_INACTIVE',
            message: 'An active subscription is required to run a scan.',
        };
    }

    if (input.hasRunningScan) {
        return {
            allowed: false,
            code: 'SCAN_IN_PROGRESS',
            message: 'A scan is already running. Please wait for it to finish.',
        };
    }

    if (input.lastScanStartedAt) {
        const elapsed = input.now.getTime() - input.lastScanStartedAt.getTime();
        if (elapsed < SCAN_RATE_LIMIT_MS) {
            return {
                allowed: false,
                code: 'RATE_LIMITED',
                message: 'You can run a new scan once per hour. Please try again later.',
                retryAfterMs: SCAN_RATE_LIMIT_MS - elapsed,
            };
        }
    }

    return { allowed: true };
}
