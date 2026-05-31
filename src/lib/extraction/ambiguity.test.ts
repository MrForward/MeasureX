/**
 * Unit tests for ambiguity flagging of low-confidence entity matches.
 *
 * Requirement 5.7: flag mentions whose confidence is below the configured
 * confidence threshold (default 0.7) as ambiguous for manual review.
 */

import { describe, it, expect } from 'vitest';
import {
    AMBIGUITY_THRESHOLD,
    isAmbiguous,
    flagAmbiguity,
    flagAmbiguousMatches,
    countAmbiguous,
} from './ambiguity';
import type { EntityMatch } from './types';

/** Build a minimal EntityMatch with the given confidence. */
function matchWithConfidence(confidence: number): EntityMatch {
    return {
        entityId: 'brand-1',
        entityType: 'brand',
        matchedText: 'HubSpot',
        matchType: confidence === 1 ? 'exact' : 'fuzzy',
        confidence,
        position: 0,
    };
}

describe('AMBIGUITY_THRESHOLD', () => {
    it('equals 0.7 (the extraction.confidence_threshold default)', () => {
        expect(AMBIGUITY_THRESHOLD).toBe(0.7);
    });
});

describe('isAmbiguous', () => {
    it('returns false for an exact match (confidence 1.0)', () => {
        expect(isAmbiguous(matchWithConfidence(1.0))).toBe(false);
    });

    it('returns true for a fuzzy match at distance 2 (confidence 0.65)', () => {
        expect(isAmbiguous(matchWithConfidence(0.65))).toBe(true);
    });

    it('returns false for a fuzzy match at distance 1 (confidence 0.825)', () => {
        expect(isAmbiguous(matchWithConfidence(0.825))).toBe(false);
    });

    it('returns false for confidence exactly on the boundary (0.7 is not strictly less)', () => {
        expect(isAmbiguous(matchWithConfidence(0.7))).toBe(false);
    });

    it('respects a custom threshold override', () => {
        // With a stricter 0.9 threshold, a 0.825 match becomes ambiguous.
        expect(isAmbiguous(matchWithConfidence(0.825), 0.9)).toBe(true);
        // With a looser 0.5 threshold, a 0.65 match is no longer ambiguous.
        expect(isAmbiguous(matchWithConfidence(0.65), 0.5)).toBe(false);
    });
});

describe('flagAmbiguity', () => {
    it('adds ambiguous: true for a low-confidence match', () => {
        const flagged = flagAmbiguity(matchWithConfidence(0.65));
        expect(flagged.ambiguous).toBe(true);
        // Preserves the original match fields.
        expect(flagged.confidence).toBe(0.65);
        expect(flagged.entityId).toBe('brand-1');
    });

    it('adds ambiguous: false for a high-confidence match', () => {
        const flagged = flagAmbiguity(matchWithConfidence(0.825));
        expect(flagged.ambiguous).toBe(false);
    });

    it('does not mutate the original match', () => {
        const match = matchWithConfidence(0.65);
        flagAmbiguity(match);
        expect(match).not.toHaveProperty('ambiguous');
    });
});

describe('flagAmbiguousMatches', () => {
    it('flags every match in an array, preserving order', () => {
        const matches = [
            matchWithConfidence(1.0),
            matchWithConfidence(0.65),
            matchWithConfidence(0.825),
        ];
        const flagged = flagAmbiguousMatches(matches);
        expect(flagged.map((m) => m.ambiguous)).toEqual([false, true, false]);
    });

    it('returns an empty array for an empty input', () => {
        expect(flagAmbiguousMatches([])).toEqual([]);
    });
});

describe('countAmbiguous', () => {
    it('returns the number of ambiguous matches', () => {
        const matches = [
            matchWithConfidence(1.0),
            matchWithConfidence(0.65),
            matchWithConfidence(0.6),
            matchWithConfidence(0.825),
        ];
        expect(countAmbiguous(matches)).toBe(2);
    });

    it('returns 0 for an empty array', () => {
        expect(countAmbiguous([])).toBe(0);
    });

    it('respects a custom threshold override', () => {
        const matches = [matchWithConfidence(0.825), matchWithConfidence(0.65)];
        expect(countAmbiguous(matches, 0.9)).toBe(2);
    });
});
