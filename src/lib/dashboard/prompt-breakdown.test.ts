import { describe, it, expect } from 'vitest';
import {
    aggregatePromptBreakdown,
    type MetricForBreakdown,
} from './prompt-breakdown';

const prompts = new Map([
    ['p1', { text: 'Best CRM for startups?', intent: 'commercial' }],
    ['p2', { text: 'How to manage remote teams', intent: 'informational' }],
]);

describe('aggregatePromptBreakdown', () => {
    it('aggregates per-engine metrics into one row per prompt', () => {
        const metrics: MetricForBreakdown[] = [
            { promptId: 'p1', engine: 'chatgpt', visibilityScore: 100, mentionCount: 1, citationRate: 100 },
            { promptId: 'p1', engine: 'perplexity', visibilityScore: 50, mentionCount: 1, citationRate: 0 },
        ];
        const [row] = aggregatePromptBreakdown(metrics, prompts);
        expect(row.promptId).toBe('p1');
        expect(row.visibilityScore).toBe(75); // (100+50)/2
        expect(row.totalMentions).toBe(2);
        expect(row.citationRate).toBe(50); // (100+0)/2
        expect(row.engines).toHaveLength(2);
        expect(row.engines.map((e) => e.engine)).toEqual(['chatgpt', 'perplexity']); // sorted
    });

    it('sorts rows by visibility score descending', () => {
        const metrics: MetricForBreakdown[] = [
            { promptId: 'p1', engine: 'chatgpt', visibilityScore: 40, mentionCount: 1, citationRate: 0 },
            { promptId: 'p2', engine: 'chatgpt', visibilityScore: 90, mentionCount: 1, citationRate: 0 },
        ];
        const rows = aggregatePromptBreakdown(metrics, prompts);
        expect(rows.map((r) => r.promptId)).toEqual(['p2', 'p1']);
    });

    it('ignores metric rows with no promptId (workspace rollups)', () => {
        const metrics: MetricForBreakdown[] = [
            { promptId: null, engine: null, visibilityScore: 80, mentionCount: 5, citationRate: 50 },
            { promptId: 'p1', engine: 'chatgpt', visibilityScore: 60, mentionCount: 1, citationRate: 0 },
        ];
        const rows = aggregatePromptBreakdown(metrics, prompts);
        expect(rows).toHaveLength(1);
        expect(rows[0].promptId).toBe('p1');
    });

    it('skips prompts not present in the prompt map', () => {
        const metrics: MetricForBreakdown[] = [
            { promptId: 'unknown', engine: 'chatgpt', visibilityScore: 60, mentionCount: 1, citationRate: 0 },
        ];
        expect(aggregatePromptBreakdown(metrics, prompts)).toHaveLength(0);
    });

    it('returns an empty array for no metrics', () => {
        expect(aggregatePromptBreakdown([], prompts)).toEqual([]);
    });
});
