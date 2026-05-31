import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    computeVisibilityScore,
    getScoreBreakdown,
    normalizeWeights,
    loadScoreWeights,
    DEFAULT_WEIGHTS,
} from './visibility-score';
import type { ExtractionResult, ScoreWeights } from '@/types';

// ── Mock the platform config so loadScoreWeights is deterministic and never
//    touches the database. config.get(key, fallback) returns whatever the test
//    queues up, otherwise the provided fallback. ──────────────────────────────
const { mockConfigGet } = vi.hoisted(() => ({ mockConfigGet: vi.fn() }));

vi.mock('@/lib/config', () => ({
    config: { get: mockConfigGet },
}));

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

describe('normalizeWeights', () => {
    it('normalizes weights that sum to 2.0 down to sum 1.0', () => {
        const weights: ScoreWeights = {
            mention: 0.5,
            position: 0.5,
            recommendation: 0.5,
            citation: 0.5,
        };
        const normalized = normalizeWeights(weights);
        const sum =
            normalized.mention +
            normalized.position +
            normalized.recommendation +
            normalized.citation;
        expect(sum).toBeCloseTo(1.0, 10);
        // Equal inputs stay equal after normalization.
        expect(normalized.mention).toBeCloseTo(0.25, 10);
        expect(normalized.position).toBeCloseTo(0.25, 10);
        expect(normalized.recommendation).toBeCloseTo(0.25, 10);
        expect(normalized.citation).toBeCloseTo(0.25, 10);
    });

    it('returns equal 0.25 weights when all weights are zero', () => {
        const normalized = normalizeWeights({
            mention: 0,
            position: 0,
            recommendation: 0,
            citation: 0,
        });
        expect(normalized).toEqual(DEFAULT_WEIGHTS);
    });

    it('returns equal weights when the sum is negative (defensive)', () => {
        const normalized = normalizeWeights({
            mention: -1,
            position: -1,
            recommendation: -1,
            citation: -1,
        });
        expect(normalized).toEqual(DEFAULT_WEIGHTS);
    });

    it('preserves the relative proportions of unequal weights', () => {
        // 0.4 : 0.2 : 0.2 : 0.2 (sum 1.0 already) should be unchanged.
        const normalized = normalizeWeights({
            mention: 0.4,
            position: 0.2,
            recommendation: 0.2,
            citation: 0.2,
        });
        expect(normalized.mention).toBeCloseTo(0.4, 10);
        expect(normalized.position).toBeCloseTo(0.2, 10);
    });
});

describe('computeVisibilityScore with custom weights', () => {
    it('produces the expected score for non-equal weights', () => {
        // Weight only mention presence; everything else contributes 0.
        const weights: ScoreWeights = {
            mention: 1,
            position: 0,
            recommendation: 0,
            citation: 0,
        };
        // mention=100, others ignored → 100 * 1.0 = 100
        const score = computeVisibilityScore(
            makeExtraction({
                brandMentioned: true,
                mentionPosition: 'last',
                recommendationStrength: 'neutral',
                brandCited: false,
            }),
            weights
        );
        expect(score).toBe(100);
    });

    it('weights citation heavily and computes the expected blended score', () => {
        // mention 0.1, position 0.1, recommendation 0.1, citation 0.7
        const weights: ScoreWeights = {
            mention: 0.1,
            position: 0.1,
            recommendation: 0.1,
            citation: 0.7,
        };
        // mention=100*0.1=10, position(first=100)*0.1=10,
        // rec(explicit=100)*0.1=10, citation=100*0.7=70 → 100
        const score = computeVisibilityScore(
            makeExtraction({
                brandMentioned: true,
                mentionPosition: 'first',
                recommendationStrength: 'explicit',
                brandCited: true,
            }),
            weights
        );
        expect(score).toBe(100);

        // Same weights but only cited → 70
        const citedOnly = computeVisibilityScore(
            makeExtraction({ brandCited: true }),
            weights
        );
        expect(citedOnly).toBe(70);
    });

    it('stays within [0, 100] for un-normalized (sum > 1) weights', () => {
        // Misconfiguration: weights sum to 4.0. Without internal normalization
        // a perfect result would naively compute to 400.
        const badWeights: ScoreWeights = {
            mention: 1,
            position: 1,
            recommendation: 1,
            citation: 1,
        };
        const score = computeVisibilityScore(
            makeExtraction({
                brandMentioned: true,
                mentionPosition: 'first',
                recommendationStrength: 'explicit',
                brandCited: true,
            }),
            badWeights
        );
        // Normalized back to equal 0.25 → perfect result is 100, not 400.
        expect(score).toBe(100);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
    });

    // Property 1 (bounds) under arbitrary weight configurations.
    it('keeps the score in [0, 100] across many weight combinations', () => {
        const positions = ['first', 'middle', 'last', null] as const;
        const strengths = ['explicit', 'neutral', 'none'] as const;
        // Deterministic pseudo-random weights (seeded LCG) — no flakiness.
        let seed = 123456789;
        const next = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
        };

        for (let i = 0; i < 200; i++) {
            const weights: ScoreWeights = {
                mention: next() * 5,
                position: next() * 5,
                recommendation: next() * 5,
                citation: next() * 5,
            };
            const extraction = makeExtraction({
                brandMentioned: next() > 0.5,
                mentionPosition: positions[Math.floor(next() * positions.length)],
                recommendationStrength: strengths[Math.floor(next() * strengths.length)],
                brandCited: next() > 0.5,
            });
            const score = computeVisibilityScore(extraction, weights);
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(100);
        }
    });
});

describe('loadScoreWeights', () => {
    beforeEach(() => {
        mockConfigGet.mockReset();
    });

    it('loads weights from the four scoring config keys', async () => {
        const stored: Record<string, number> = {
            'scoring.mention_weight': 0.4,
            'scoring.position_weight': 0.2,
            'scoring.recommendation_weight': 0.1,
            'scoring.citation_weight': 0.3,
        };
        mockConfigGet.mockImplementation(async (key: string) => stored[key]);

        const weights = await loadScoreWeights();
        expect(weights).toEqual({
            mention: 0.4,
            position: 0.2,
            recommendation: 0.1,
            citation: 0.3,
        });
    });

    it('falls back to equal 0.25 defaults when config returns the fallback', async () => {
        // Simulate config.get returning the provided fallback for every key
        // (i.e. key missing / DB unavailable).
        mockConfigGet.mockImplementation(
            async (_key: string, fallback: number) => fallback
        );

        const weights = await loadScoreWeights();
        expect(weights).toEqual(DEFAULT_WEIGHTS);
    });
});
