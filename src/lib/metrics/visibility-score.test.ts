import { describe, it, expect } from 'vitest';
import { computeVisibilityScore, getScoreBreakdown } from './visibility-score';
import type { ExtractionResult } from '@/types';

function makeExtraction(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
    return {
        brandMentioned: false,
        mentionPosition: null,
        recommendationStrength: 'none',
        brandCited: false,
        confidenceScore: 1,
        ambiguous: false,
        citations: [],
        ...overrides,
    };
}

describe('computeVisibilityScore', () => {
    it('returns 0 when nothing matches', () => {
        expect(computeVisibilityScore(makeExtraction())).toBe(0);
    });

    it('returns 100 for a perfect result (first position, explicit rec, cited)', () => {
        const score = computeVisibilityScore(
            makeExtraction({
                brandMentioned: true,
                mentionPosition: 'first',
                recommendationStrength: 'explicit',
                brandCited: true,
            })
        );
        expect(score).toBe(100);
    });

    it('returns 25 for mention-only (binary presence, no position/rec/citation)', () => {
        // mention=100*0.25=25, position(null)=0, rec(none)=0, citation=0 → 25
        const score = computeVisibilityScore(
            makeExtraction({ brandMentioned: true })
        );
        expect(score).toBe(25);
    });

    // Property 1: Score Bounds — always 0-100
    it('always produces a score between 0 and 100', () => {
        const positions = ['first', 'middle', 'last', null] as const;
        const strengths = ['explicit', 'neutral', 'none'] as const;
        for (const mentioned of [true, false]) {
            for (const position of positions) {
                for (const strength of strengths) {
                    for (const cited of [true, false]) {
                        const score = computeVisibilityScore(
                            makeExtraction({
                                brandMentioned: mentioned,
                                mentionPosition: position,
                                recommendationStrength: strength,
                                brandCited: cited,
                            })
                        );
                        expect(score).toBeGreaterThanOrEqual(0);
                        expect(score).toBeLessThanOrEqual(100);
                    }
                }
            }
        }
    });

    // Property 2: Determinism — same input, same output
    it('is deterministic', () => {
        const extraction = makeExtraction({
            brandMentioned: true,
            mentionPosition: 'middle',
            recommendationStrength: 'neutral',
            brandCited: true,
        });
        const a = computeVisibilityScore(extraction);
        const b = computeVisibilityScore(extraction);
        expect(a).toBe(b);
    });
});

describe('getScoreBreakdown', () => {
    it('breakdown total matches computeVisibilityScore', () => {
        const extraction = makeExtraction({
            brandMentioned: true,
            mentionPosition: 'first',
            recommendationStrength: 'explicit',
            brandCited: false,
        });
        const breakdown = getScoreBreakdown(extraction);
        expect(breakdown.total).toBe(computeVisibilityScore(extraction));
    });
});
