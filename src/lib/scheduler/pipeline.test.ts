/**
 * Unit tests for pipeline.ts
 *
 * Validates: Requirement 4.5 (post-execution pipeline trigger)
 *
 * Tests the pipeline orchestration logic:
 *   - areAllExtractionsComplete: checks if all successful executions have extractions
 *   - onExtractionComplete: publishes metrics job only when all extractions are done
 *   - onMetricsComplete: publishes recommendations job
 *   - onRecommendationsComplete: publishes notifications job
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
    db: {
        execution: {
            count: vi.fn(),
        },
        run: {
            updateMany: vi.fn(),
        },
    },
}));

vi.mock('@/lib/queue/qstash', () => ({
    publishJob: vi.fn(),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import {
    areAllExtractionsComplete,
    onExtractionComplete,
    onMetricsComplete,
    onRecommendationsComplete,
} from './pipeline';
import { db } from '@/lib/db';
import { publishJob } from '@/lib/queue/qstash';

// ── Typed mock helpers ────────────────────────────────────────────────────────

const mockExecutionCount = db.execution.count as ReturnType<typeof vi.fn>;
const mockRunUpdateMany = db.run.updateMany as ReturnType<typeof vi.fn>;
const mockPublishJob = publishJob as ReturnType<typeof vi.fn>;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('areAllExtractionsComplete', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns true when all successful executions have extractions', async () => {
        mockExecutionCount.mockResolvedValue(0);

        const result = await areAllExtractionsComplete('run-1');

        expect(result).toBe(true);
        expect(mockExecutionCount).toHaveBeenCalledWith({
            where: {
                runId: 'run-1',
                status: 'success',
                extraction: null,
            },
        });
    });

    it('returns false when some successful executions are missing extractions', async () => {
        mockExecutionCount.mockResolvedValue(3);

        const result = await areAllExtractionsComplete('run-1');

        expect(result).toBe(false);
    });
});

describe('onExtractionComplete', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('publishes metrics job when all extractions are done and the claim is won', async () => {
        mockExecutionCount.mockResolvedValue(0); // all extracted
        mockRunUpdateMany.mockResolvedValue({ count: 1 }); // won the claim
        mockPublishJob.mockResolvedValue(undefined);

        await onExtractionComplete('exec-1', 'ws-1', 'run-1');

        // Claims the metrics step atomically (only when not yet started).
        expect(mockRunUpdateMany).toHaveBeenCalledWith({
            where: { id: 'run-1', metricsStartedAt: null },
            data: { metricsStartedAt: expect.any(Date) },
        });
        expect(mockPublishJob).toHaveBeenCalledWith('metrics', {
            runId: 'run-1',
            workspaceId: 'ws-1',
        });
    });

    it('does NOT publish metrics twice when the claim was already taken (fire-once)', async () => {
        mockExecutionCount.mockResolvedValue(0); // all extracted
        mockRunUpdateMany.mockResolvedValue({ count: 0 }); // another extraction already claimed

        await onExtractionComplete('exec-1', 'ws-1', 'run-1');

        expect(mockPublishJob).not.toHaveBeenCalled();
    });

    it('does NOT publish metrics job when extractions are still pending', async () => {
        mockExecutionCount.mockResolvedValue(2); // 2 still unextracted

        await onExtractionComplete('exec-1', 'ws-1', 'run-1');

        expect(mockRunUpdateMany).not.toHaveBeenCalled();
        expect(mockPublishJob).not.toHaveBeenCalled();
    });
});

describe('onMetricsComplete', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('publishes recommendations job', async () => {
        mockPublishJob.mockResolvedValue(undefined);

        await onMetricsComplete('run-1', 'ws-1');

        expect(mockPublishJob).toHaveBeenCalledWith('recommendations', {
            runId: 'run-1',
            workspaceId: 'ws-1',
        });
    });
});

describe('onRecommendationsComplete', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('publishes notifications job with run_complete type', async () => {
        mockPublishJob.mockResolvedValue(undefined);

        await onRecommendationsComplete('run-1', 'ws-1');

        expect(mockPublishJob).toHaveBeenCalledWith('notifications', {
            type: 'run_complete',
            workspaceId: 'ws-1',
            userId: '',
            data: { runId: 'run-1' },
        });
    });
});
