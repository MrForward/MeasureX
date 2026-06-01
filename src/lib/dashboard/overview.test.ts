/**
 * Unit tests for src/lib/dashboard/overview.ts.
 *
 * Validates: Requirement 7.1 (overview panel data load)
 * Validates: Requirement 6.4 (week-over-week change values)
 *
 * These tests mock the Prisma client at the module boundary so the data layer
 * can be tested in pure isolation — no database, no clock dependencies, no
 * snapshot ordering surprises.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Prisma client ────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
    db: {
        prompt: { count: vi.fn() },
        run: { findMany: vi.fn() },
        metric: { findMany: vi.fn() },
    },
}));

import { db } from '@/lib/db';
import { loadOverviewData } from './overview';

const mockDb = db as unknown as {
    prompt: { count: ReturnType<typeof vi.fn> };
    run: { findMany: ReturnType<typeof vi.fn> };
    metric: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
    vi.clearAllMocks();
    // Sensible defaults — individual tests override what they care about.
    mockDb.prompt.count.mockResolvedValue(0);
    mockDb.run.findMany.mockResolvedValue([]);
    mockDb.metric.findMany.mockResolvedValue([]);
});

// ── Empty state ───────────────────────────────────────────────────────────────

describe('loadOverviewData — empty state', () => {
    it('returns hasData=false with zeroed metrics when no completed runs exist', async () => {
        mockDb.prompt.count.mockResolvedValue(5);
        mockDb.run.findMany.mockResolvedValue([]); // no runs

        const overview = await loadOverviewData('ws-1');

        expect(overview.hasData).toBe(false);
        expect(overview.visibilityScore).toBe(0);
        expect(overview.totalMentions).toBe(0);
        expect(overview.citationRate).toBe(0);
        expect(overview.wowChange.visibilityScore).toBeNull();
        expect(overview.wowChange.totalMentions).toBeNull();
        expect(overview.wowChange.citationRate).toBeNull();
        expect(overview.lastRunAt).toBeNull();
        // Active prompt count is independent of run state.
        expect(overview.totalPrompts).toBe(5);
    });

    it('only counts active prompts (status=active)', async () => {
        mockDb.prompt.count.mockResolvedValue(3);

        await loadOverviewData('ws-1');

        expect(mockDb.prompt.count).toHaveBeenCalledWith({
            where: { workspaceId: 'ws-1', status: 'active' },
        });
    });

    it('returns hasData=false when the latest run has zero metric rows', async () => {
        // Edge case: a run record exists (e.g. status=completed) but no metrics
        // were ever written for it. Treat as empty rather than showing zeros
        // next to a real timestamp.
        mockDb.prompt.count.mockResolvedValue(2);
        mockDb.run.findMany.mockResolvedValue([
            { id: 'run-1', completedAt: new Date('2024-01-08'), createdAt: new Date('2024-01-08') },
        ]);
        mockDb.metric.findMany.mockResolvedValue([]); // no metrics for that run

        const overview = await loadOverviewData('ws-1');

        expect(overview.hasData).toBe(false);
        expect(overview.lastRunAt).toBeNull();
        expect(overview.totalPrompts).toBe(2);
    });

    it('only considers completed and partial runs (excludes queued/in_progress/failed)', async () => {
        await loadOverviewData('ws-1');

        const args = mockDb.run.findMany.mock.calls[0][0];
        expect(args.where).toMatchObject({
            workspaceId: 'ws-1',
            status: { in: ['completed', 'partial'] },
        });
        // Two most recent runs only — latest + previous for WoW.
        expect(args.take).toBe(2);
    });
});

// ── Single completed run ──────────────────────────────────────────────────────

describe('loadOverviewData — one completed run', () => {
    it('aggregates metrics across the latest run', async () => {
        mockDb.prompt.count.mockResolvedValue(2);
        mockDb.run.findMany.mockResolvedValue([
            {
                id: 'run-1',
                completedAt: new Date('2024-01-08T10:00:00Z'),
                createdAt: new Date('2024-01-08T09:00:00Z'),
            },
        ]);
        mockDb.metric.findMany.mockResolvedValue([
            // run-1: 4 metric rows (2 prompts × 2 engines)
            { runId: 'run-1', visibilityScore: 80, mentionCount: 3, citationRate: 50 },
            { runId: 'run-1', visibilityScore: 60, mentionCount: 1, citationRate: 0 },
            { runId: 'run-1', visibilityScore: 70, mentionCount: 2, citationRate: 100 },
            { runId: 'run-1', visibilityScore: 50, mentionCount: 0, citationRate: 0 },
        ]);

        const overview = await loadOverviewData('ws-1');

        expect(overview.hasData).toBe(true);
        // Mean of 80, 60, 70, 50 = 65
        expect(overview.visibilityScore).toBe(65);
        // Sum of mention counts = 3 + 1 + 2 + 0
        expect(overview.totalMentions).toBe(6);
        // Mean of 50, 0, 100, 0 = 37.5
        expect(overview.citationRate).toBe(37.5);
        expect(overview.lastRunAt).toEqual(new Date('2024-01-08T10:00:00Z'));
    });

    it('returns null WoW changes when only one run exists', async () => {
        mockDb.run.findMany.mockResolvedValue([
            { id: 'run-1', completedAt: new Date(), createdAt: new Date() },
        ]);
        mockDb.metric.findMany.mockResolvedValue([
            { runId: 'run-1', visibilityScore: 50, mentionCount: 1, citationRate: 25 },
        ]);

        const overview = await loadOverviewData('ws-1');

        expect(overview.hasData).toBe(true);
        expect(overview.wowChange.visibilityScore).toBeNull();
        expect(overview.wowChange.totalMentions).toBeNull();
        expect(overview.wowChange.citationRate).toBeNull();
    });

    it('falls back to createdAt when completedAt is null', async () => {
        const created = new Date('2024-01-08T08:00:00Z');
        mockDb.run.findMany.mockResolvedValue([
            { id: 'run-1', completedAt: null, createdAt: created },
        ]);
        mockDb.metric.findMany.mockResolvedValue([
            { runId: 'run-1', visibilityScore: 70, mentionCount: 1, citationRate: 0 },
        ]);

        const overview = await loadOverviewData('ws-1');

        expect(overview.lastRunAt).toEqual(created);
    });
});

// ── Two runs — week-over-week ────────────────────────────────────────────────

describe('loadOverviewData — week-over-week', () => {
    it('computes WoW change for each headline metric when a previous run exists', async () => {
        mockDb.run.findMany.mockResolvedValue([
            {
                id: 'run-2',
                completedAt: new Date('2024-01-15T10:00:00Z'),
                createdAt: new Date('2024-01-15T09:00:00Z'),
            },
            {
                id: 'run-1',
                completedAt: new Date('2024-01-08T10:00:00Z'),
                createdAt: new Date('2024-01-08T09:00:00Z'),
            },
        ]);
        mockDb.metric.findMany.mockResolvedValue([
            // run-2 (latest): visibility=80, mentions=10, citation=50
            { runId: 'run-2', visibilityScore: 80, mentionCount: 10, citationRate: 50 },
            // run-1 (previous): visibility=60, mentions=5, citation=20
            { runId: 'run-1', visibilityScore: 60, mentionCount: 5, citationRate: 20 },
        ]);

        const overview = await loadOverviewData('ws-1');

        expect(overview.hasData).toBe(true);
        expect(overview.visibilityScore).toBe(80);
        expect(overview.totalMentions).toBe(10);
        expect(overview.citationRate).toBe(50);

        // WoW for visibility: 80 - 60 = +20 (notable, up)
        expect(overview.wowChange.visibilityScore).not.toBeNull();
        expect(overview.wowChange.visibilityScore?.delta).toBe(20);
        expect(overview.wowChange.visibilityScore?.direction).toBe('up');
        expect(overview.wowChange.visibilityScore?.classification).toBe('notable');

        // WoW for mentions: 10 - 5 = +5
        expect(overview.wowChange.totalMentions?.delta).toBe(5);
        expect(overview.wowChange.totalMentions?.direction).toBe('up');

        // WoW for citation rate: 50 - 20 = +30
        expect(overview.wowChange.citationRate?.delta).toBe(30);
        expect(overview.wowChange.citationRate?.classification).toBe('significant_shift');
    });

    it('handles a run with metrics where the previous run has none (returns null WoW)', async () => {
        // The previous run record exists but produced zero metric rows.
        // We can't compute a meaningful delta, so WoW stays null.
        mockDb.run.findMany.mockResolvedValue([
            { id: 'run-2', completedAt: new Date('2024-01-15'), createdAt: new Date('2024-01-15') },
            { id: 'run-1', completedAt: new Date('2024-01-08'), createdAt: new Date('2024-01-08') },
        ]);
        mockDb.metric.findMany.mockResolvedValue([
            { runId: 'run-2', visibilityScore: 70, mentionCount: 4, citationRate: 25 },
            // no rows for run-1
        ]);

        const overview = await loadOverviewData('ws-1');

        expect(overview.hasData).toBe(true);
        expect(overview.wowChange.visibilityScore).toBeNull();
        expect(overview.wowChange.totalMentions).toBeNull();
        expect(overview.wowChange.citationRate).toBeNull();
    });

    it('flags a small WoW change as within_normal_variance', async () => {
        // 3-point swing — that's noise per Requirement 15.2.
        mockDb.run.findMany.mockResolvedValue([
            { id: 'run-2', completedAt: new Date('2024-01-15'), createdAt: new Date('2024-01-15') },
            { id: 'run-1', completedAt: new Date('2024-01-08'), createdAt: new Date('2024-01-08') },
        ]);
        mockDb.metric.findMany.mockResolvedValue([
            { runId: 'run-2', visibilityScore: 53, mentionCount: 5, citationRate: 25 },
            { runId: 'run-1', visibilityScore: 50, mentionCount: 5, citationRate: 25 },
        ]);

        const overview = await loadOverviewData('ws-1');

        expect(overview.wowChange.visibilityScore?.classification).toBe(
            'within_normal_variance',
        );
        expect(overview.wowChange.totalMentions?.classification).toBe(
            'within_normal_variance',
        );
    });
});

// ── Active prompt counting ────────────────────────────────────────────────────

describe('loadOverviewData — active prompt counting', () => {
    it('reports the count returned by Prisma even when there are runs', async () => {
        mockDb.prompt.count.mockResolvedValue(12);
        mockDb.run.findMany.mockResolvedValue([
            { id: 'run-1', completedAt: new Date(), createdAt: new Date() },
        ]);
        mockDb.metric.findMany.mockResolvedValue([
            { runId: 'run-1', visibilityScore: 50, mentionCount: 1, citationRate: 0 },
        ]);

        const overview = await loadOverviewData('ws-1');

        expect(overview.totalPrompts).toBe(12);
    });

    it('reports 0 active prompts when none exist', async () => {
        mockDb.prompt.count.mockResolvedValue(0);

        const overview = await loadOverviewData('ws-1');

        expect(overview.totalPrompts).toBe(0);
        expect(overview.hasData).toBe(false);
    });
});
