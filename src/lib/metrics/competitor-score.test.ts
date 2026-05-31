import { describe, it, expect } from 'vitest';
import {
    signalsToExtraction,
    competitorVisibilityScore,
    aggregateCompetitorScore,
    computeAllCompetitorScores,
    computeCompetitorGaps,
    type EntityExtractionSignals,
    type CompetitorExecution,
    type CompetitorScoreResult,
} from './competitor-score';
import { computeVisibilityScore } from './visibility-score';
import type { ExtractionResult } from '@/types';

/** Build competitor signals with sensible "not present" defaults. */
function signals(
    overrides: Partial<EntityExtractionSignals> = {}
): EntityExtractionSignals {
    return {
        entityId: 'comp-1',
        mentioned: false,
        position: null,
        recommendationStrength: 'none',
        cited: false,
        ...overrides,
    };
}

/** Build a competitor execution from a competitorId and signal overrides. */
function execution(
    competitorId: string,
    overrides: Partial<EntityExtractionSignals> = {}
): CompetitorExecution {
    return {
        competitorId,
        signals: signals({ entityId: competitorId, ...overrides }),
    };
}

describe('signalsToExtraction', () => {
    it('maps every signal field onto the ExtractionResult shape', () => {
        const result = signalsToExtraction(
            signals({
                mentioned: true,
                position: 'middle',
                recommendationStrength: 'neutral',
                cited: true,
            })
        );

        const expected: ExtractionResult = {
            brandMentioned: true,
            mentionPosition: 'middle',
            recommendationStrength: 'neutral',
            brandCited: true,
            confidenceScore: 1,
            ambiguous: false,
            citations: [],
        };
        expect(result).toEqual(expected);
    });

    it('maps "not present" signals to a zero-scoring extraction', () => {
        expect(signalsToExtraction(signals())).toEqual({
            brandMentioned: false,
            mentionPosition: null,
            recommendationStrength: 'none',
            brandCited: false,
            confidenceScore: 1,
            ambiguous: false,
            citations: [],
        });
    });
});

describe('competitorVisibilityScore', () => {
    it('produces the same result as the brand formula for equivalent signals', () => {
        const s = signals({
            mentioned: true,
            position: 'middle',
            recommendationStrength: 'neutral',
            cited: false,
        });
        // The brand formula applied to the equivalent extraction.
        const brandEquivalent = computeVisibilityScore(signalsToExtraction(s));
        expect(competitorVisibilityScore(s)).toBe(brandEquivalent);
    });

    it('scores perfect competitor signals as 100', () => {
        const perfect = signals({
            mentioned: true,
            position: 'first',
            recommendationStrength: 'explicit',
            cited: true,
        });
        expect(competitorVisibilityScore(perfect)).toBe(100);
    });

    it('scores an absent competitor as 0', () => {
        expect(competitorVisibilityScore(signals())).toBe(0);
    });

    it('uses the SAME formula as the brand for an identical signal set', () => {
        // A competitor with brand-equivalent signals must get the brand score.
        // Mentioned (25) + first position (25) + explicit (25) + not cited (0)
        // = 100*0.25 + 100*0.25 + 100*0.25 + 0*0.25 = 75.
        const s = signals({
            mentioned: true,
            position: 'first',
            recommendationStrength: 'explicit',
            cited: false,
        });
        const brandExtraction: ExtractionResult = {
            brandMentioned: true,
            mentionPosition: 'first',
            recommendationStrength: 'explicit',
            brandCited: false,
            confidenceScore: 0.42, // non-scoring field; must not matter
            ambiguous: true, // non-scoring field; must not matter
            citations: [],
        };
        expect(competitorVisibilityScore(s)).toBe(
            computeVisibilityScore(brandExtraction)
        );
        expect(competitorVisibilityScore(s)).toBe(75);
    });

    it('honors custom weights', () => {
        // Only the citation factor carries weight; competitor not cited → 0.
        const notCited = signals({
            mentioned: true,
            position: 'first',
            recommendationStrength: 'explicit',
            cited: false,
        });
        const weights = {
            mention: 0,
            position: 0,
            recommendation: 0,
            citation: 1,
        };
        expect(competitorVisibilityScore(notCited, weights)).toBe(0);
        // Same weights but the competitor IS cited → full 100.
        const cited = signals({ ...notCited, cited: true });
        expect(competitorVisibilityScore(cited, weights)).toBe(100);
    });
});

describe('aggregateCompetitorScore', () => {
    it('averages the per-execution scores for a single competitor', () => {
        // Execution A: mentioned + first + explicit + cited = 100
        // Execution B: absent = 0  →  average (100 + 0) / 2 = 50
        const executions: CompetitorExecution[] = [
            execution('comp-1', {
                mentioned: true,
                position: 'first',
                recommendationStrength: 'explicit',
                cited: true,
            }),
            execution('comp-1'),
        ];
        expect(aggregateCompetitorScore(executions, 'comp-1')).toBe(50);
    });

    it('ignores executions belonging to other competitors', () => {
        const executions: CompetitorExecution[] = [
            execution('comp-1', {
                mentioned: true,
                position: 'first',
                recommendationStrength: 'explicit',
                cited: true,
            }),
            // comp-2 is absent; must not drag down comp-1's average.
            execution('comp-2'),
        ];
        expect(aggregateCompetitorScore(executions, 'comp-1')).toBe(100);
    });

    it('rounds the average to the nearest integer', () => {
        // Scores 100, 0, 0 → 33.33 → 33.
        const executions: CompetitorExecution[] = [
            execution('comp-1', {
                mentioned: true,
                position: 'first',
                recommendationStrength: 'explicit',
                cited: true,
            }),
            execution('comp-1'),
            execution('comp-1'),
        ];
        expect(aggregateCompetitorScore(executions, 'comp-1')).toBe(33);
    });

    it('returns 0 when the competitor has no executions', () => {
        expect(aggregateCompetitorScore([], 'comp-1')).toBe(0);
        expect(
            aggregateCompetitorScore([execution('comp-2')], 'comp-1')
        ).toBe(0);
    });
});

describe('computeAllCompetitorScores', () => {
    it('groups by competitor and produces a breakdown for each', () => {
        const executions: CompetitorExecution[] = [
            // comp-1: one perfect (100), one absent (0) → avg 50, 1 mention
            execution('comp-1', {
                mentioned: true,
                position: 'first',
                recommendationStrength: 'explicit',
                cited: true,
            }),
            execution('comp-1'),
            // comp-2: one mentioned-only (mention 25 of 100) → avg 25, 1 mention
            execution('comp-2', { mentioned: true }),
        ];

        const results = computeAllCompetitorScores(executions);
        expect(results).toEqual<CompetitorScoreResult[]>([
            {
                competitorId: 'comp-1',
                visibilityScore: 50,
                mentionCount: 1,
                executionCount: 2,
            },
            {
                competitorId: 'comp-2',
                visibilityScore: 25,
                mentionCount: 1,
                executionCount: 1,
            },
        ]);
    });

    it('preserves first-seen competitor order', () => {
        const executions: CompetitorExecution[] = [
            execution('zoho'),
            execution('salesforce'),
            execution('zoho'),
        ];
        const ids = computeAllCompetitorScores(executions).map(
            (r) => r.competitorId
        );
        expect(ids).toEqual(['zoho', 'salesforce']);
    });

    it('handles empty input', () => {
        expect(computeAllCompetitorScores([])).toEqual([]);
    });
});

describe('computeCompetitorGaps', () => {
    const scores: CompetitorScoreResult[] = [
        {
            competitorId: 'ahead',
            visibilityScore: 80,
            mentionCount: 2,
            executionCount: 2,
        },
        {
            competitorId: 'behind',
            visibilityScore: 30,
            mentionCount: 1,
            executionCount: 2,
        },
    ];

    it('reports a positive gap and competitorAhead=true when the competitor leads', () => {
        const gaps = computeCompetitorGaps(50, scores);
        expect(gaps[0]).toEqual({
            competitorId: 'ahead',
            competitorScore: 80,
            brandScore: 50,
            gap: 30,
            competitorAhead: true,
        });
    });

    it('reports a negative gap and competitorAhead=false when the brand leads', () => {
        const gaps = computeCompetitorGaps(50, scores);
        expect(gaps[1]).toEqual({
            competitorId: 'behind',
            competitorScore: 30,
            brandScore: 50,
            gap: -20,
            competitorAhead: false,
        });
    });

    it('treats an exact tie as the competitor not being ahead', () => {
        const tie: CompetitorScoreResult[] = [
            {
                competitorId: 'tie',
                visibilityScore: 50,
                mentionCount: 1,
                executionCount: 1,
            },
        ];
        const [gap] = computeCompetitorGaps(50, tie);
        expect(gap.gap).toBe(0);
        expect(gap.competitorAhead).toBe(false);
    });

    it('surfaces gaps exceeding 20 points for the 17.5 recommendation trigger', () => {
        // brand 40, competitor 80 → gap 40 (> 20): a flagged, ahead competitor.
        const [gap] = computeCompetitorGaps(40, [
            {
                competitorId: 'dominant',
                visibilityScore: 80,
                mentionCount: 3,
                executionCount: 3,
            },
        ]);
        expect(gap.competitorAhead).toBe(true);
        expect(gap.gap).toBeGreaterThan(20);
    });

    it('returns an empty array when there are no competitors', () => {
        expect(computeCompetitorGaps(50, [])).toEqual([]);
    });
});
