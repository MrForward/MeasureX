/**
 * Unit and property tests for the centralized confidence-scoring module.
 *
 * Requirement 5.6: assign a Confidence_Score in the range 0-1.
 * design Property 8: FOR ALL exact matches, confidence SHALL be 1.0.
 */

import { describe, it, expect } from 'vitest';
import {
    EXACT_MATCH_CONFIDENCE,
    MIN_FUZZY_CONFIDENCE,
    MAX_FUZZY_CONFIDENCE,
    CONFIDENCE_PENALTY_PER_EDIT,
    fuzzyConfidence,
    computeConfidence,
} from './confidence';

describe('confidence constants', () => {
    it('exposes an exact-match confidence of 1.0', () => {
        expect(EXACT_MATCH_CONFIDENCE).toBe(1.0);
    });

    it('exposes fuzzy bounds of [0.5, 0.9]', () => {
        expect(MIN_FUZZY_CONFIDENCE).toBe(0.5);
        expect(MAX_FUZZY_CONFIDENCE).toBe(0.9);
    });

    it('exposes a per-edit penalty of 0.175', () => {
        expect(CONFIDENCE_PENALTY_PER_EDIT).toBe(0.175);
    });
});

describe('fuzzyConfidence', () => {
    it('returns 0.9 for distance 0 (clamped down from 1.0 — fuzzy max is 0.9)', () => {
        expect(fuzzyConfidence(0)).toBeCloseTo(0.9, 10);
    });

    it('returns 0.825 for distance 1 (1 - 1 * 0.175)', () => {
        expect(fuzzyConfidence(1)).toBeCloseTo(0.825, 10);
    });

    it('returns 0.65 for distance 2 (1 - 2 * 0.175)', () => {
        expect(fuzzyConfidence(2)).toBeCloseTo(0.65, 10);
    });

    it('returns 0.5 for distance 3 (clamped up from 0.475)', () => {
        expect(fuzzyConfidence(3)).toBeCloseTo(0.5, 10);
    });

    it('stays clamped at the floor for large distances', () => {
        expect(fuzzyConfidence(100)).toBe(MIN_FUZZY_CONFIDENCE);
    });

    // Property test: FOR ALL edit distances 0-10, fuzzyConfidence is in [0.5, 0.9].
    // Validates: Requirements 5.6
    it('always returns a value within [0.5, 0.9] for distances 0-10', () => {
        for (let distance = 0; distance <= 10; distance += 1) {
            const confidence = fuzzyConfidence(distance);
            expect(confidence).toBeGreaterThanOrEqual(MIN_FUZZY_CONFIDENCE);
            expect(confidence).toBeLessThanOrEqual(MAX_FUZZY_CONFIDENCE);
        }
    });
});

describe('computeConfidence', () => {
    it('returns 1.0 for an exact match', () => {
        expect(computeConfidence('exact')).toBe(1.0);
    });

    it('ignores the edit distance for exact matches', () => {
        expect(computeConfidence('exact', 5)).toBe(1.0);
    });

    it('returns 0.825 for a fuzzy match at distance 1', () => {
        expect(computeConfidence('fuzzy', 1)).toBeCloseTo(0.825, 10);
    });

    it('defaults a fuzzy match with no distance to the max fuzzy confidence', () => {
        expect(computeConfidence('fuzzy')).toBeCloseTo(0.9, 10);
    });

    // Validates: design Property 8 — exact matches are always 1.0, fuzzy never reach it.
    it('never reports a fuzzy match as certain as an exact match', () => {
        for (let distance = 0; distance <= 10; distance += 1) {
            expect(computeConfidence('fuzzy', distance)).toBeLessThan(EXACT_MATCH_CONFIDENCE);
        }
    });
});
