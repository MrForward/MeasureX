/**
 * Unit tests for the dashboard view-model assembly (PRD §F7).
 */

import { describe, it, expect } from 'vitest';
import { buildDashboardData, type RawScan } from './dashboard-data';

const BRAND = { name: 'MeasureX', domain: 'measurex.io' };
const COMPETITORS = [
    { id: 'c1', name: 'Otterly', domain: 'otterly.ai' },
    { id: 'c2', name: 'Peec', domain: 'peec.ai' },
];

function run(over: Partial<RawScan['runs'][number]>): RawScan['runs'][number] {
    return {
        id: 'r1',
        engine: 'chatgpt',
        status: 'completed',
        prompt: { id: 'p1', text: 'best tools', category: 'category' },
        extraction: {
            brandMentioned: true,
            brandPosition: 1,
            brandRecommendation: 'MENTIONED',
            promptScore: 2,
            competitorResults: [],
            citations: [],
        },
        ...over,
    };
}

describe('buildDashboardData', () => {
    it('returns an empty view-model when there is no scan', () => {
        const data = buildDashboardData(null, BRAND, COMPETITORS);
        expect(data.scan).toBeNull();
        expect(data.rows).toEqual([]);
        expect(data.competitorCards).toEqual([]);
        expect(data.competitors).toHaveLength(2);
    });

    it('maps runs to rows with brand + per-competitor mention flags', () => {
        const scan: RawScan = {
            id: 's1', status: 'completed', overallScore: 50, delta: 5,
            engineScores: { chatgpt: 60, perplexity: 40 },
            totalPrompts: 1, completedRuns: 1, failedRuns: 0,
            startedAt: new Date('2026-06-10T00:00:00Z'), completedAt: new Date('2026-06-10T00:02:00Z'),
            runs: [
                run({
                    extraction: {
                        brandMentioned: true, brandPosition: 2, brandRecommendation: 'MENTIONED', promptScore: 1,
                        competitorResults: [
                            { competitorId: 'c1', mentioned: true, position: 1, mentionCount: 1, recommendation: 'MENTIONED' },
                            { competitorId: 'c2', mentioned: false, position: null, mentionCount: 0, recommendation: 'ABSENT' },
                        ],
                        citations: [],
                    },
                }),
            ],
        };
        const data = buildDashboardData(scan, BRAND, COMPETITORS);
        expect(data.scan?.overallScore).toBe(50);
        expect(data.scan?.engineScores).toEqual({ chatgpt: 60, perplexity: 40 });
        expect(data.rows).toHaveLength(1);
        expect(data.rows[0].competitorMentioned).toEqual({ c1: true, c2: false });
        expect(data.rows[0].brandPosition).toBe(2);
    });

    it('scores competitors with the brand formula and counts gaps', () => {
        // Two runs: in both, Otterly (c1) is recommended + first and the brand is absent.
        const mkRun = (id: string): RawScan['runs'][number] =>
            run({
                id,
                extraction: {
                    brandMentioned: false, brandPosition: null, brandRecommendation: 'ABSENT', promptScore: 0,
                    competitorResults: [
                        { competitorId: 'c1', mentioned: true, position: 1, mentionCount: 1, recommendation: 'RECOMMENDED' },
                    ],
                    citations: [],
                },
            });
        const scan: RawScan = {
            id: 's1', status: 'completed', overallScore: 0, delta: null,
            engineScores: { chatgpt: 0, perplexity: 0 },
            totalPrompts: 2, completedRuns: 2, failedRuns: 0,
            startedAt: '2026-06-10T00:00:00Z', completedAt: '2026-06-10T00:02:00Z',
            runs: [mkRun('a'), mkRun('b')],
        };
        const data = buildDashboardData(scan, BRAND, COMPETITORS);
        const c1 = data.competitorCards.find((c) => c.competitorId === 'c1')!;
        // recommended(3) + before-all bonus(1) = 4 per run → 8/(2×4)×100 = 100.
        expect(c1.score).toBe(100);
        expect(c1.gapCount).toBe(2); // competitor present, brand absent, both runs
        expect(c1.mentionedCount).toBe(2);
    });

    it('excludes failed runs from competitor scoring but keeps them as rows', () => {
        const scan: RawScan = {
            id: 's1', status: 'partial', overallScore: 25, delta: null,
            engineScores: { chatgpt: 25, perplexity: 0 },
            totalPrompts: 1, completedRuns: 1, failedRuns: 1,
            startedAt: '2026-06-10T00:00:00Z', completedAt: null,
            runs: [
                run({ id: 'ok' }),
                run({ id: 'failed', status: 'failed', engine: 'perplexity', extraction: null }),
            ],
        };
        const data = buildDashboardData(scan, BRAND, COMPETITORS);
        expect(data.rows).toHaveLength(2);
        const failedRow = data.rows.find((r) => r.runId === 'failed')!;
        expect(failedRow.score).toBeNull();
        expect(failedRow.brandMentioned).toBe(false);
        expect(data.competitorCards[0].totalRuns).toBe(1); // only the completed run
    });
});
