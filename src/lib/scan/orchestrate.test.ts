/**
 * Integration eval for scan orchestration (PRD §F4 execution + §F6 scoring).
 *
 * Uses the REAL extraction + scoring pipeline with a mocked engine runner, so
 * these assert the whole "responses → extraction → score" path end-to-end
 * without network or DB.
 */

import { describe, it, expect } from 'vitest';
import { orchestrateScan, type RunEngineFn, type ScanPrompt } from './orchestrate';
import type { EngineId, EngineRunResult } from '@/lib/engines/runners/types';
import type { ExtractionEntity } from '@/lib/extraction/types';

const BRAND: ExtractionEntity = { id: 'brand', name: 'MeasureX', domain: 'measurex.io' };
const COMPETITORS: ExtractionEntity[] = [
    { id: 'c-otterly', name: 'Otterly', domain: 'otterly.ai' },
    { id: 'c-peec', name: 'Peec', domain: 'peec.ai' },
];
const PROMPTS: ScanPrompt[] = [
    { id: 'p1', text: 'best AEO tools' },
    { id: 'p2', text: 'top brand monitoring software' },
];

function completed(engine: EngineId, rawResponse: string, citations: string[] = []): EngineRunResult {
    return {
        engine,
        model: engine === 'chatgpt' ? 'gpt-4o-mini' : 'sonar',
        status: 'completed',
        rawResponse,
        nativeCitations: engine === 'perplexity' ? citations : [],
        tokensUsed: 100,
        errorMessage: null,
    };
}

function failed(engine: EngineId): EngineRunResult {
    return {
        engine,
        model: engine === 'chatgpt' ? 'gpt-4o-mini' : 'sonar',
        status: 'failed',
        rawResponse: null,
        nativeCitations: null,
        tokensUsed: null,
        errorMessage: 'simulated failure',
    };
}

describe('orchestrateScan', () => {
    it('scores a perfect scan (recommended + first everywhere) at 100', async () => {
        const runEngine: RunEngineFn = async (engine) =>
            completed(
                engine,
                'I recommend MeasureX as the best option. Otterly and Peec are also fine.',
            );

        const result = await orchestrateScan({
            brand: BRAND,
            competitors: COMPETITORS,
            prompts: PROMPTS,
            runEngine,
        });

        expect(result.status).toBe('completed');
        expect(result.totalRuns).toBe(4); // 2 prompts × 2 engines
        expect(result.completedRuns).toBe(4);
        expect(result.failedRuns).toBe(0);
        expect(result.overallScore).toBe(100);
        expect(result.engineScores).toEqual({ chatgpt: 100, perplexity: 100 });
        // every record produced an extraction with promptScore 4
        expect(result.records.every((r) => r.extraction?.promptScore === 4)).toBe(true);
    });

    it('runs sequentially (prompt-major, engine order) and reports progress', async () => {
        const order: string[] = [];
        const progress: Array<[number, number]> = [];
        const runEngine: RunEngineFn = async (engine, prompt) => {
            order.push(`${prompt.id}:${engine}`);
            return completed(engine, 'MeasureX is mentioned here.');
        };

        await orchestrateScan({
            brand: BRAND,
            competitors: COMPETITORS,
            prompts: PROMPTS,
            engines: ['chatgpt', 'perplexity'],
            runEngine,
            onRun: (_r, done, total) => void progress.push([done, total]),
        });

        expect(order).toEqual([
            'p1:chatgpt',
            'p1:perplexity',
            'p2:chatgpt',
            'p2:perplexity',
        ]);
        expect(progress).toEqual([
            [1, 4],
            [2, 4],
            [3, 4],
            [4, 4],
        ]);
    });

    it('marks a scan partial when some runs fail and excludes them from scoring', async () => {
        // chatgpt completes (brand mentioned AFTER a competitor → score 1); perplexity fails.
        const runEngine: RunEngineFn = async (engine) =>
            engine === 'chatgpt'
                ? completed(engine, 'Otterly is great. MeasureX is fine too.')
                : failed(engine);

        const result = await orchestrateScan({
            brand: BRAND,
            competitors: COMPETITORS,
            prompts: PROMPTS,
            runEngine,
        });

        expect(result.status).toBe('partial');
        expect(result.completedRuns).toBe(2);
        expect(result.failedRuns).toBe(2);
        // 2 completed runs, score 1 each → 2 / (2 × 4) × 100 = 25
        expect(result.overallScore).toBe(25);
        expect(result.engineScores).toEqual({ chatgpt: 25, perplexity: 0 });
        // failed runs carry no extraction
        const failedRecords = result.records.filter((r) => r.result.status === 'failed');
        expect(failedRecords.every((r) => r.extraction === null)).toBe(true);
    });

    it('marks a scan failed when every run fails', async () => {
        const runEngine: RunEngineFn = async (engine) => failed(engine);
        const result = await orchestrateScan({
            brand: BRAND,
            competitors: COMPETITORS,
            prompts: PROMPTS,
            runEngine,
        });
        expect(result.status).toBe('failed');
        expect(result.overallScore).toBe(0);
        expect(result.completedRuns).toBe(0);
        expect(result.engineScores).toEqual({ chatgpt: 0, perplexity: 0 });
    });

    it('computes delta against the previous score', async () => {
        const runEngine: RunEngineFn = async (engine) =>
            completed(
                engine,
                'I recommend MeasureX as the best option. Otterly and Peec are alternatives.',
            );
        const result = await orchestrateScan({
            brand: BRAND,
            competitors: COMPETITORS,
            prompts: PROMPTS,
            previousScore: 80,
            runEngine,
        });
        expect(result.overallScore).toBe(100);
        expect(result.previousScore).toBe(80);
        expect(result.delta).toBe(20);
    });

    it('returns null delta for a first scan', async () => {
        const runEngine: RunEngineFn = async (engine) => completed(engine, 'MeasureX is here.');
        const result = await orchestrateScan({
            brand: BRAND,
            competitors: COMPETITORS,
            prompts: PROMPTS,
            runEngine,
        });
        expect(result.delta).toBeNull();
    });

    it('extracts Perplexity native citations into the result', async () => {
        const runEngine: RunEngineFn = async (engine) =>
            engine === 'perplexity'
                ? completed(engine, 'See sources on MeasureX.', [
                      'https://g2.com/measurex',
                      'https://measurex.io/blog',
                  ])
                : completed(engine, 'MeasureX is a tool.');

        const result = await orchestrateScan({
            brand: BRAND,
            competitors: COMPETITORS,
            prompts: [{ id: 'p1', text: 'q' }],
            runEngine,
        });

        const perplexityRecord = result.records.find((r) => r.engine === 'perplexity');
        const classes = perplexityRecord?.extraction?.citations.map((c) => c.classification) ?? [];
        expect(classes).toContain('owned');
        expect(classes).toContain('review_site');
    });
});
