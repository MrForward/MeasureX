/**
 * Unit tests for the scan-over-scan delta (PRD §F6).
 */

import { describe, it, expect } from 'vitest';
import { computeDelta } from './change-detection';

describe('computeDelta', () => {
    it('returns current - previous when a previous scan exists', () => {
        expect(computeDelta(70, 65)).toBe(5);
        expect(computeDelta(60, 75)).toBe(-15);
        expect(computeDelta(50, 50)).toBe(0);
    });

    it('returns null for the first-ever scan', () => {
        expect(computeDelta(70, null)).toBeNull();
        expect(computeDelta(70, undefined)).toBeNull();
    });
});
