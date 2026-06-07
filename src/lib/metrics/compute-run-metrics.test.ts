import { describe, it, expect } from 'vitest';
import {
    buildMetricRecord,
    toExtractionResult,
    type ExecutionForMetric,
    type ExtractionForMetric,
} from './compute-run-metrics';

const execution: ExecutionForMetric = {
    id: 'exec-1',
    promptId: 'prompt-1',
    engine: 'chatgpt',
    date: new Date('2026-06-01T00:00:00Z'),
};

function extraction(overrides: Partial<ExtractionForMetric> = {}): ExtractionForMetric {
    return {
        brandMentioned: true,
        mentionPosition: 'first',
        recommendationStrength: 'explicit',
        brandCited: true,
        confidenceScore: 1.0,
        ambiguous: false,
        mentions: [{ entityType: 'brand' }],
        citations: [],
        ...overrides,
    };
}

describe('buildMetricRecord', () => {
    it('scores a perfect extraction at 100 and links the source execution', () => {
        const record = buildMetricRecord('ws-1', 'run-1', execution, extraction());
        expect(record.visibilityScore).toBe(100);
        expect(record.rawExecutionId).toBe('exec-1'); // Property 3 traceability
        expect(record.promptId).toBe('prompt-1');
        expect(record.engine).toBe('chatgpt');
        expect(record.citationRate).toBe(100);
        expect(record.avgPosition).toBe(1);
        expect(record.mentionCount).toBe(1);
    });

    it('scores a no-mention extraction at 0', () => {
        const record = buildMetricRecord(
            'ws-1',
            'run-1',
            execution,
            extraction({
                brandMentioned: false,
                mentionPosition: null,
                recommendationStrength: 'none',
                brandCited: false,
                mentions: [],
            }),
        );
        expect(record.visibilityScore).toBe(0);
        expect(record.citationRate).toBe(0);
        expect(record.avgPosition).toBeNull();
        expect(record.mentionCount).toBe(0);
    });

    it('counts only brand mentions toward mentionCount', () => {
        const record = buildMetricRecord(
            'ws-1',
            'run-1',
            execution,
            extraction({
                mentions: [
                    { entityType: 'brand' },
                    { entityType: 'brand' },
                    { entityType: 'competitor' },
                ],
            }),
        );
        expect(record.mentionCount).toBe(2);
    });

    it('always produces a score within [0, 100]', () => {
        for (const pos of ['first', 'middle', 'last', null] as const) {
            for (const strength of ['explicit', 'neutral', 'none'] as const) {
                const record = buildMetricRecord(
                    'ws-1',
                    'run-1',
                    execution,
                    extraction({ mentionPosition: pos, recommendationStrength: strength }),
                );
                expect(record.visibilityScore).toBeGreaterThanOrEqual(0);
                expect(record.visibilityScore).toBeLessThanOrEqual(100);
            }
        }
    });
});

describe('toExtractionResult', () => {
    it('normalizes null DB strings into strict union types', () => {
        const result = toExtractionResult(
            extraction({ mentionPosition: null, recommendationStrength: null }),
        );
        expect(result.mentionPosition).toBeNull();
        expect(result.recommendationStrength).toBe('none');
    });
});
