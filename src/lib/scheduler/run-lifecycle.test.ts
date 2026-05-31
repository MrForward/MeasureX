/**
 * Unit tests for run-lifecycle.ts
 *
 * Validates: Requirement 4.4  (run status tracking: queued → in_progress → completed/partial/failed)
 * Validates: Requirement 18.1 (partial failure handling)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
    db: {
        run: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        execution: {
            count: vi.fn(),
        },
    },
}));

vi.mock('@/lib/engines/execution-store', () => ({
    finalizeRun: vi.fn(),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { markRunInProgress, checkRunCompletion } from './run-lifecycle';
import { db } from '@/lib/db';
import { finalizeRun } from '@/lib/engines/execution-store';

// ── Typed mock helpers ────────────────────────────────────────────────────────

const mockDb = db as unknown as {
    run: {
        findUnique: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
    };
    execution: {
        count: ReturnType<typeof vi.fn>;
    };
};
const mockFinalizeRun = finalizeRun as ReturnType<typeof vi.fn>;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('markRunInProgress', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('transitions a "queued" run to "in_progress" with startedAt', async () => {
        mockDb.run.findUnique.mockResolvedValue({ status: 'queued' });
        mockDb.run.update.mockResolvedValue(undefined);

        await markRunInProgress('run-1');

        expect(mockDb.run.findUnique).toHaveBeenCalledWith({
            where: { id: 'run-1' },
            select: { status: true },
        });
        expect(mockDb.run.update).toHaveBeenCalledWith({
            where: { id: 'run-1' },
            data: {
                status: 'in_progress',
                startedAt: expect.any(Date),
            },
        });
    });

    it('is a no-op when run is already "in_progress"', async () => {
        mockDb.run.findUnique.mockResolvedValue({ status: 'in_progress' });

        await markRunInProgress('run-1');

        expect(mockDb.run.update).not.toHaveBeenCalled();
    });

    it('is a no-op when run is already "completed"', async () => {
        mockDb.run.findUnique.mockResolvedValue({ status: 'completed' });

        await markRunInProgress('run-1');

        expect(mockDb.run.update).not.toHaveBeenCalled();
    });

    it('is a no-op when run is not found', async () => {
        mockDb.run.findUnique.mockResolvedValue(null);

        await markRunInProgress('run-nonexistent');

        expect(mockDb.run.update).not.toHaveBeenCalled();
    });
});

describe('checkRunCompletion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns { complete: false } when pending executions remain', async () => {
        mockDb.execution.count.mockResolvedValue(3);

        const result = await checkRunCompletion('run-1');

        expect(result).toEqual({ complete: false });
        expect(mockFinalizeRun).not.toHaveBeenCalled();
    });

    it('calls finalizeRun and returns { complete: true, status } when no pending remain', async () => {
        mockDb.execution.count.mockResolvedValue(0);
        mockFinalizeRun.mockResolvedValue(undefined);
        mockDb.run.findUnique.mockResolvedValue({ status: 'completed' });

        const result = await checkRunCompletion('run-1');

        expect(mockFinalizeRun).toHaveBeenCalledWith('run-1');
        expect(result).toEqual({ complete: true, status: 'completed' });
    });

    it('returns "partial" status when finalizeRun sets partial', async () => {
        mockDb.execution.count.mockResolvedValue(0);
        mockFinalizeRun.mockResolvedValue(undefined);
        mockDb.run.findUnique.mockResolvedValue({ status: 'partial' });

        const result = await checkRunCompletion('run-1');

        expect(result).toEqual({ complete: true, status: 'partial' });
    });

    it('returns "failed" status when finalizeRun sets failed', async () => {
        mockDb.execution.count.mockResolvedValue(0);
        mockFinalizeRun.mockResolvedValue(undefined);
        mockDb.run.findUnique.mockResolvedValue({ status: 'failed' });

        const result = await checkRunCompletion('run-1');

        expect(result).toEqual({ complete: true, status: 'failed' });
    });
});
