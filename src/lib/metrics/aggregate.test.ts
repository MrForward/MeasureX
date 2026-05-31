import { describe, it, expect } from 'vitest';
import {
    averageVisibilityScore,
    mentionCount,
    averageMentionPosition,
    citationRate,
    aggregateByPrompt,
    aggregateByEngine,
    computeWorkspaceAggregate,
    type ScoredExecution,
} from './aggregate';
import type { EngineId, ExtractionResult, MentionPosition } from '@/types';

function makeExtraction(
    overrides: Partial<ExtractionResult> = {}
): ExtractionResult {
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

function makeExecution(
    overrides: {
        promptId?: string;
        engine?: EngineId;
        date?: string;
        visibilityScore?: number;
        brandMentioned?: boolean;
        mentionPosition?: MentionPosition;
        brandCited?: boolean;
    } = {}
): ScoredExecution {
    return {
        promptId: overrides.promptId ?? 'p1',
        engine: overrides.engine ?? 'chatgpt',
        date: overrides.date ?? '2024-01-01',
        visibilityScore: overrides.visibilityScore ?? 0,
        extraction: makeExtraction({
            brandMentioned: overrides.brandMentioned ?? false,
            mentionPosition: overrides.mentionPosition ?? null,
            brandCited: overrides.brandCited ?? false,
        }),
    };
}

describe('averageVisibilityScore', () => {
    it('computes the correct mean and rounds to nearest integer', () => {
        const executions = [
            makeExecution({ visibilityScore: 50 }),
            makeExecution({ visibilityScore: 75 }),
            makeExecution({ visibilityScore: 100 }),
        ];
        // mean = 225 / 3 = 75
        expect(averageVisibilityScore(executions)).toBe(75);
    });

    it('rounds a fractional mean to the nearest integer', () => {
        const executions = [
            makeExecution({ visibilityScore: 10 }),
            makeExecution({ visibilityScore: 11 }),
        ];
        // mean = 10.5 → rounds to 11
        expect(averageVisibilityScore(executions)).toBe(11);
    });

    it('returns 0 for an empty set', () => {
        expect(averageVisibilityScore([])).toBe(0);
    });
});

describe('mentionCount', () => {
    it('counts only executions where the brand was mentioned', () => {
        const executions = [
            makeExecution({ brandMentioned: true }),
            makeExecution({ brandMentioned: false }),
            makeExecution({ brandMentioned: true }),
        ];
        expect(mentionCount(executions)).toBe(2);
    });

    it('returns 0 for an empty set', () => {
        expect(mentionCount([])).toBe(0);
    });
});

describe('averageMentionPosition', () => {
    it('computes the mean position (first=1, middle=2, last=3)', () => {
        const executions = [
            makeExecution({ mentionPosition: 'first' }), // 1
            makeExecution({ mentionPosition: 'middle' }), // 2
            makeExecution({ mentionPosition: 'last' }), // 3
        ];
        // mean = 6 / 3 = 2
        expect(averageMentionPosition(executions)).toBe(2);
    });

    it('ignores executions without a positioned mention', () => {
        const executions = [
            makeExecution({ mentionPosition: 'first' }), // 1
            makeExecution({ mentionPosition: null }), // ignored
            makeExecution({ mentionPosition: 'last' }), // 3
        ];
        // mean = (1 + 3) / 2 = 2
        expect(averageMentionPosition(executions)).toBe(2);
    });

    it('rounds to two decimal places', () => {
        const executions = [
            makeExecution({ mentionPosition: 'first' }), // 1
            makeExecution({ mentionPosition: 'first' }), // 1
            makeExecution({ mentionPosition: 'last' }), // 3
        ];
        // mean = 5 / 3 = 1.6666... → 1.67
        expect(averageMentionPosition(executions)).toBe(1.67);
    });

    it('returns null when there are no positioned mentions', () => {
        const executions = [
            makeExecution({ mentionPosition: null }),
            makeExecution({ mentionPosition: null }),
        ];
        expect(averageMentionPosition(executions)).toBeNull();
    });

    it('returns null for an empty set', () => {
        expect(averageMentionPosition([])).toBeNull();
    });
});

describe('citationRate', () => {
    it('computes the percentage of cited executions', () => {
        const executions = [
            makeExecution({ brandCited: true }),
            makeExecution({ brandCited: false }),
            makeExecution({ brandCited: false }),
            makeExecution({ brandCited: true }),
        ];
        // 2 / 4 = 50%
        expect(citationRate(executions)).toBe(50);
    });

    it('rounds to one decimal place', () => {
        const executions = [
            makeExecution({ brandCited: true }),
            makeExecution({ brandCited: false }),
            makeExecution({ brandCited: false }),
        ];
        // 1 / 3 = 33.333% → 33.3
        expect(citationRate(executions)).toBe(33.3);
    });

    it('returns 0 for an empty set', () => {
        expect(citationRate([])).toBe(0);
    });
});

describe('aggregateByPrompt', () => {
    it('groups executions by prompt and computes per-prompt aggregates', () => {
        const executions = [
            makeExecution({
                promptId: 'p1',
                visibilityScore: 100,
                brandMentioned: true,
                brandCited: true,
            }),
            makeExecution({
                promptId: 'p1',
                visibilityScore: 0,
                brandMentioned: false,
                brandCited: false,
            }),
            makeExecution({
                promptId: 'p2',
                visibilityScore: 50,
                brandMentioned: true,
                brandCited: false,
            }),
        ];
        const result = aggregateByPrompt(executions);
        expect(result).toHaveLength(2);

        const p1 = result.find((r) => r.promptId === 'p1');
        expect(p1).toEqual({
            promptId: 'p1',
            visibilityScore: 50, // (100 + 0) / 2
            mentionCount: 1,
            citationRate: 50, // 1 / 2
            executionCount: 2,
        });

        const p2 = result.find((r) => r.promptId === 'p2');
        expect(p2).toEqual({
            promptId: 'p2',
            visibilityScore: 50,
            mentionCount: 1,
            citationRate: 0,
            executionCount: 1,
        });
    });

    it('returns an empty array for empty input', () => {
        expect(aggregateByPrompt([])).toEqual([]);
    });
});

describe('aggregateByEngine', () => {
    it('groups executions by engine and computes per-engine aggregates', () => {
        const executions = [
            makeExecution({
                engine: 'chatgpt',
                visibilityScore: 80,
                brandMentioned: true,
                brandCited: true,
            }),
            makeExecution({
                engine: 'chatgpt',
                visibilityScore: 40,
                brandMentioned: true,
                brandCited: false,
            }),
            makeExecution({
                engine: 'perplexity',
                visibilityScore: 0,
                brandMentioned: false,
                brandCited: false,
            }),
        ];
        const result = aggregateByEngine(executions);
        expect(result).toHaveLength(2);

        const chatgpt = result.find((r) => r.engine === 'chatgpt');
        expect(chatgpt).toEqual({
            engine: 'chatgpt',
            visibilityScore: 60, // (80 + 40) / 2
            mentionCount: 2,
            citationRate: 50, // 1 / 2
            executionCount: 2,
        });

        const perplexity = result.find((r) => r.engine === 'perplexity');
        expect(perplexity).toEqual({
            engine: 'perplexity',
            visibilityScore: 0,
            mentionCount: 0,
            citationRate: 0,
            executionCount: 1,
        });
    });

    it('returns an empty array for empty input', () => {
        expect(aggregateByEngine([])).toEqual([]);
    });
});

describe('computeWorkspaceAggregate', () => {
    it('produces the correct overall metrics plus breakdowns', () => {
        const executions: ScoredExecution[] = [
            makeExecution({
                promptId: 'p1',
                engine: 'chatgpt',
                visibilityScore: 100,
                brandMentioned: true,
                mentionPosition: 'first',
                brandCited: true,
            }),
            makeExecution({
                promptId: 'p1',
                engine: 'perplexity',
                visibilityScore: 50,
                brandMentioned: true,
                mentionPosition: 'last',
                brandCited: false,
            }),
            makeExecution({
                promptId: 'p2',
                engine: 'chatgpt',
                visibilityScore: 0,
                brandMentioned: false,
                mentionPosition: null,
                brandCited: false,
            }),
        ];

        const result = computeWorkspaceAggregate(executions);

        expect(result.visibilityScore).toBe(50); // (100 + 50 + 0) / 3 = 50
        expect(result.mentionCount).toBe(2);
        expect(result.averagePosition).toBe(2); // (1 + 3) / 2, null ignored
        expect(result.citationRate).toBe(33.3); // 1 / 3
        expect(result.totalExecutions).toBe(3);
        expect(result.byPrompt).toHaveLength(2);
        expect(result.byEngine).toHaveLength(2);

        const p1 = result.byPrompt.find((r) => r.promptId === 'p1');
        expect(p1?.visibilityScore).toBe(75); // (100 + 50) / 2
        expect(p1?.executionCount).toBe(2);
    });

    it('handles empty input without throwing', () => {
        const result = computeWorkspaceAggregate([]);
        expect(result).toEqual({
            visibilityScore: 0,
            mentionCount: 0,
            averagePosition: null,
            citationRate: 0,
            totalExecutions: 0,
            byPrompt: [],
            byEngine: [],
        });
    });
});
