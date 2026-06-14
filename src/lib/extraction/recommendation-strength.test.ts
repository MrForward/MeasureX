/**
 * Unit tests for recommendation-strength detection (PRD §F5d).
 */

import { describe, it, expect } from 'vitest';
import { detectRecommendationStrength } from './recommendation-strength';

describe('detectRecommendationStrength', () => {
    it('returns ABSENT when the brand is not mentioned', () => {
        expect(detectRecommendationStrength('Some text.', 'MeasureX', false)).toBe('ABSENT');
    });

    it('returns MENTIONED when detected but no pattern matches', () => {
        expect(
            detectRecommendationStrength('MeasureX is a tool.', 'MeasureX', true),
        ).toBe('MENTIONED');
    });

    it('detects "I recommend {brand}"', () => {
        expect(
            detectRecommendationStrength('I recommend MeasureX highly.', 'MeasureX', true),
        ).toBe('RECOMMENDED');
    });

    it('detects "{brand} is the best"', () => {
        expect(
            detectRecommendationStrength('MeasureX is the best for AEO.', 'MeasureX', true),
        ).toBe('RECOMMENDED');
    });

    it('detects "{brand} stands out"', () => {
        expect(
            detectRecommendationStrength('Among them, MeasureX stands out.', 'MeasureX', true),
        ).toBe('RECOMMENDED');
    });

    it('downgrades a negated pattern to MENTIONED', () => {
        // "not the best option is MeasureX" — negation cue within 10 chars before the pattern.
        expect(
            detectRecommendationStrength('It is not the best option is MeasureX really.', 'MeasureX', true),
        ).toBe('MENTIONED');
    });
});
