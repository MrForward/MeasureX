/**
 * F6 Scoring eval (PRD §F6, "Scoring test") + unit tests for the scoring
 * primitives. The 5 eval scenarios below mirror the PRD table exactly and must
 * all pass (5/5).
 */

import { describe, it, expect } from 'vitest';
import {
    scorePromptEngine,
    computeOverallScore,
    computePerEngineScores,
    type PromptScoreSignals,
} from './visibility-score';

/** Build `count` prompt-engine scores all equal to `score`. */
function repeated(score: number, count: number): number[] {
    return Array.from({ length: count }, () => score);
}

const ABSENT: PromptScoreSignals = { mentioned: false, cited: false, recommended: false, beforeAllCompetitors: false };
const MENTIONED: PromptScoreSignals = { mentioned: true, cited: false, recommended: false, beforeAllCompetitors: false };
const CITED: PromptScoreSignals = { mentioned: true, cited: true, recommended: false, beforeAllCompetitors: false };
const RECOMMENDED: PromptScoreSignals = { mentioned: true, cited: false, recommended: true, beforeAllCompetitors: false };
const RECOMMENDED_FIRST: PromptScoreSignals = { mentioned: true, cited: false, recommended: true, beforeAllCompetitors: true };

describe('scorePromptEngine (PRD §F6 base + bonus)', () => {
    it('maps each condition to the right 0-4 score', () => {
        expect(scorePromptEngine(ABSENT)).toBe(0);
        expect(scorePromptEngine(MENTIONED)).toBe(1);
        expect(scorePromptEngine(CITED)).toBe(2);
        expect(scorePromptEngine(RECOMMENDED)).toBe(3);
        expect(scorePromptEngine(RECOMMENDED_FIRST)).toBe(4);
    });

    it('adds the bonus to the highest applicable base, capped at 4', () => {
        expect(scorePromptEngine({ ...MENTIONED, beforeAllCompetitors: true })).toBe(2);
        expect(scorePromptEngine({ ...CITED, beforeAllCompetitors: true })).toBe(3);
    });
});

describe('F6 scoring eval', () => {
    it('Test 1 — 20 prompts × 2 engines, brand absent everywhere → 0', () => {
        const scores = Array.from({ length: 40 }, () => scorePromptEngine(ABSENT));
        expect(computeOverallScore(scores)).toBe(0);
    });

    it('Test 2 — 20 prompts × 2 engines, brand mentioned everywhere → 25', () => {
        const scores = Array.from({ length: 40 }, () => scorePromptEngine(MENTIONED));
        expect(scores.every((s) => s === 1)).toBe(true);
        expect(computeOverallScore(scores)).toBe(25);
    });

    it('Test 3 — 20 prompts × 2 engines, recommended + first everywhere → 100', () => {
        const scores = Array.from({ length: 40 }, () => scorePromptEngine(RECOMMENDED_FIRST));
        expect(scores.every((s) => s === 4)).toBe(true);
        expect(computeOverallScore(scores)).toBe(100);
    });

    it('Test 4 — 10 mentioned + 10 absent across 2 engines → 13', () => {
        const scores = [
            ...Array.from({ length: 10 }, () => scorePromptEngine(MENTIONED)),
            ...Array.from({ length: 10 }, () => scorePromptEngine(ABSENT)),
            ...Array.from({ length: 10 }, () => scorePromptEngine(MENTIONED)),
            ...Array.from({ length: 10 }, () => scorePromptEngine(ABSENT)),
        ];
        // sum = 20, max = 40 × 4 = 160 → 12.5 → 13
        expect(computeOverallScore(scores)).toBe(13);
    });

    it('Test 5 — mix 5 rec / 5 cited / 5 mentioned / 5 absent × 2 engines → 38', () => {
        const perEngine = [
            ...Array.from({ length: 5 }, () => scorePromptEngine(RECOMMENDED)),
            ...Array.from({ length: 5 }, () => scorePromptEngine(CITED)),
            ...Array.from({ length: 5 }, () => scorePromptEngine(MENTIONED)),
            ...Array.from({ length: 5 }, () => scorePromptEngine(ABSENT)),
        ];
        const scores = [...perEngine, ...perEngine]; // 2 engines
        // sum = (15 + 10 + 5 + 0) × 2 = 60, max = 40 × 4 = 160 → 37.5 → 38
        expect(computeOverallScore(scores)).toBe(38);
    });
});

describe('computeOverallScore edge cases', () => {
    it('returns 0 for an empty scan', () => {
        expect(computeOverallScore([])).toBe(0);
    });
});

describe('computePerEngineScores', () => {
    it('scores each engine independently', () => {
        const out = computePerEngineScores({
            chatgpt: repeated(4, 10), // all perfect → 100
            perplexity: repeated(1, 10), // all mentioned → 25
        });
        expect(out).toEqual({ chatgpt: 100, perplexity: 25 });
    });
});
