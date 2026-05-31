/**
 * Unit tests for mention position analysis.
 *
 * Requirement 5.5: record mention position (first, middle, last third)
 * Requirement 6.1: position factor (first=100%, middle=66%, last=33%)
 *
 * All assertions are deterministic — no time or randomness involved.
 */

import { describe, it, expect } from 'vitest';
import {
    getPositionThird,
    getEarliestMatch,
    getBrandMentionPosition,
} from './position-analysis';
import type { EntityMatch } from './types';

/** Build a minimal brand EntityMatch at a given character position. */
function brandMatchAt(position: number): EntityMatch {
    return {
        entityId: 'brand-1',
        entityType: 'brand',
        matchedText: 'HubSpot',
        matchType: 'exact',
        confidence: 1,
        position,
    };
}

describe('getPositionThird', () => {
    it("returns 'first' for an index in the first third", () => {
        // textLength 30 → thirds at [0,10), [10,20), [20,30]
        expect(getPositionThird(0, 30)).toBe('first');
        expect(getPositionThird(5, 30)).toBe('first');
        expect(getPositionThird(9, 30)).toBe('first');
    });

    it("returns 'middle' for an index in the middle third", () => {
        expect(getPositionThird(10, 30)).toBe('middle');
        expect(getPositionThird(15, 30)).toBe('middle');
        expect(getPositionThird(19, 30)).toBe('middle');
    });

    it("returns 'last' for an index in the last third", () => {
        expect(getPositionThird(20, 30)).toBe('last');
        expect(getPositionThird(25, 30)).toBe('last');
        expect(getPositionThird(30, 30)).toBe('last');
    });

    it('handles boundaries correctly (exactly at 1/3 and 2/3)', () => {
        // 1/3 boundary is inclusive of 'middle', 2/3 boundary inclusive of 'last'.
        expect(getPositionThird(10, 30)).toBe('middle');
        expect(getPositionThird(20, 30)).toBe('last');

        // Non-evenly-divisible length: 100 → boundaries at 33.33 and 66.67
        expect(getPositionThird(33, 100)).toBe('first');
        expect(getPositionThird(34, 100)).toBe('middle');
        expect(getPositionThird(66, 100)).toBe('middle');
        expect(getPositionThird(67, 100)).toBe('last');
    });

    it('returns null for empty text (length 0)', () => {
        expect(getPositionThird(0, 0)).toBeNull();
        expect(getPositionThird(5, 0)).toBeNull();
    });

    it('returns null for negative text length', () => {
        expect(getPositionThird(0, -10)).toBeNull();
    });

    it('clamps out-of-bounds indices into range', () => {
        // Negative index clamps to start → 'first'.
        expect(getPositionThird(-5, 30)).toBe('first');
        // Index beyond the end clamps to textLength → 'last'.
        expect(getPositionThird(999, 30)).toBe('last');
    });
});

describe('getEarliestMatch', () => {
    it('returns the match with the lowest position', () => {
        const matches = [brandMatchAt(50), brandMatchAt(10), brandMatchAt(30)];
        const earliest = getEarliestMatch(matches);
        expect(earliest).not.toBeNull();
        expect(earliest?.position).toBe(10);
    });

    it('returns the single match when only one exists', () => {
        const earliest = getEarliestMatch([brandMatchAt(42)]);
        expect(earliest?.position).toBe(42);
    });

    it('returns null for an empty array', () => {
        expect(getEarliestMatch([])).toBeNull();
    });
});

describe('getBrandMentionPosition', () => {
    it('uses the EARLIEST match when multiple exist', () => {
        // Earliest at position 5 of a length-30 text → first third.
        const matches = [brandMatchAt(25), brandMatchAt(5), brandMatchAt(15)];
        expect(getBrandMentionPosition(matches, 30)).toBe('first');
    });

    it('classifies a mid-text earliest mention as middle', () => {
        const matches = [brandMatchAt(15), brandMatchAt(28)];
        expect(getBrandMentionPosition(matches, 30)).toBe('middle');
    });

    it('classifies a late earliest mention as last', () => {
        const matches = [brandMatchAt(25)];
        expect(getBrandMentionPosition(matches, 30)).toBe('last');
    });

    it('returns null for no matches (brand not mentioned)', () => {
        expect(getBrandMentionPosition([], 30)).toBeNull();
    });

    it('returns null when text has no length', () => {
        expect(getBrandMentionPosition([brandMatchAt(0)], 0)).toBeNull();
    });
});
