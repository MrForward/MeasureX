/**
 * Unit tests for per-competitor scoring (PRD §F6 / §F7).
 */

import { describe, it, expect } from 'vitest';
import {
    scoreCompetitorPromptEngine,
    computeCompetitorScore,
    countCompetitorGaps,
    type CompetitorPromptSignals,
} from './competitor-score';

const sig = (o: Partial<CompetitorPromptSignals>): CompetitorPromptSignals => ({
    mentioned: false,
    cited: false,
    recommended: false,
    beforeAllOthers: false,
    ...o,
});

describe('scoreCompetitorPromptEngine', () => {
    it('uses the same 0-4 formula as the brand', () => {
        expect(scoreCompetitorPromptEngine(sig({}))).toBe(0);
        expect(scoreCompetitorPromptEngine(sig({ mentioned: true }))).toBe(1);
        expect(scoreCompetitorPromptEngine(sig({ mentioned: true, cited: true }))).toBe(2);
        expect(scoreCompetitorPromptEngine(sig({ mentioned: true, recommended: true }))).toBe(3);
        expect(
            scoreCompetitorPromptEngine(sig({ mentioned: true, recommended: true, beforeAllOthers: true })),
        ).toBe(4);
    });
});

describe('computeCompetitorScore', () => {
    it('aggregates to 0-100 like the brand score', () => {
        // 20 mentioned (1 each) across 2 engines = 40 scores of 1 → 25.
        const signals = Array.from({ length: 40 }, () => sig({ mentioned: true }));
        expect(computeCompetitorScore(signals)).toBe(25);
    });

    it('returns 0 when the competitor is never mentioned', () => {
        expect(computeCompetitorScore([sig({}), sig({})])).toBe(0);
    });
});

describe('countCompetitorGaps', () => {
    it('counts prompt-engines where the competitor wins and the brand is absent', () => {
        const competitor = [true, true, false, true];
        const brand = [false, true, false, false];
        // gaps: index 0 (T/F) and index 3 (T/F) → 2
        expect(countCompetitorGaps(competitor, brand)).toBe(2);
    });
});
