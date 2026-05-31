/**
 * Unit tests for execution-store.ts
 *
 * Validates: Requirement 4.6  (timestamp, engine, prompt, raw_response_ref,
 *                               status, model_version, error_details stored)
 * Validates: Requirement 19.1 (immutable audit trail)
 * Validates: Requirement 18.1 (partial failure handling)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Prisma client ────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
    db: {
        execution: {
            create: vi.fn(),
            update: vi.fn(),
            findUnique: vi.fn(),
            findMany: vi.fn(),
        },
        run: {
            update: vi.fn(),
            findUniqueOrThrow: vi.fn(),
        },
        $transaction: vi.fn(),
    },
}));

import { db } from '@/lib/db';
import {
    createExecution,
    markExecutionSuccess,
    markExecutionFailed,
    markExecutionSkipped,
    getExecution,
    getRunExecutions,
    incrementRunCounter,
    finalizeRun,
} from './execution-store';
import { EngineError } from './types';
import type { StandardizedResponse } from './types';

// ── Typed mock helpers ────────────────────────────────────────────────────────

const mockDb = db as unknown as {
    execution: {
        create: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        findUnique: ReturnType<typeof vi.fn>;
        findMany: ReturnType<typeof vi.fn>;
    };
    run: {
        update: ReturnType<typeof vi.fn>;
        findUniqueOrThrow: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_RESPONSE: StandardizedResponse = {
    rawText: 'HubSpot is a great CRM.',
    citations: [],
    metadata: {},
    modelVersion: 'gpt-4o-2024-05-13',
    timestamp: new Date('2024-01-01T00:00:00Z'),
    executionTimeMs: 450,
};

function makeEngineError(msg = 'API error'): EngineError {
    return new EngineError(msg, 'chatgpt', 'api_error', true, 500);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createExecution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates a record with status "pending" and returns the new ID', async () => {
        mockDb.execution.create.mockResolvedValue({ id: 'exec-1' });

        const id = await createExecution({
            runId: 'run-1',
            promptId: 'prompt-1',
            engine: 'chatgpt',
            workspaceId: 'ws-1',
        });

        expect(id).toBe('exec-1');
        expect(mockDb.execution.create).toHaveBeenCalledWith({
            data: {
                runId: 'run-1',
                promptId: 'prompt-1',
                engine: 'chatgpt',
                status: 'pending',
            },
            select: { id: true },
        });
    });
});

describe('markExecutionSuccess', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('updates status to "success" and sets rawResponseRef, checksum, modelVersion, executionTimeMs', async () => {
        mockDb.execution.update.mockResolvedValue({});

        await markExecutionSuccess('exec-1', MOCK_RESPONSE, 'r2/raw/exec-1.json', 'sha256-abc');

        expect(mockDb.execution.update).toHaveBeenCalledWith({
            where: { id: 'exec-1' },
            data: {
                status: 'success',
                rawResponseRef: 'r2/raw/exec-1.json',
                responseChecksum: 'sha256-abc',
                modelVersion: 'gpt-4o-2024-05-13',
                executionTimeMs: 450,
            },
        });
    });
});

describe('markExecutionFailed', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('updates status to "failed" and sets errorDetails and retryCount', async () => {
        mockDb.execution.update.mockResolvedValue({});
        const error = makeEngineError('Rate limit exceeded');

        await markExecutionFailed('exec-2', error, 3);

        expect(mockDb.execution.update).toHaveBeenCalledWith({
            where: { id: 'exec-2' },
            data: expect.objectContaining({
                status: 'failed',
                retryCount: 3,
            }),
        });

        // errorDetails should be a JSON string containing the error message
        const callData = mockDb.execution.update.mock.calls[0][0].data;
        const parsed = JSON.parse(callData.errorDetails);
        expect(parsed.message).toBe('Rate limit exceeded');
        expect(parsed.code).toBe('api_error');
        expect(parsed.engineId).toBe('chatgpt');
    });
});

describe('markExecutionSkipped', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('updates status to "skipped" and sets errorDetails to the reason', async () => {
        mockDb.execution.update.mockResolvedValue({});

        await markExecutionSkipped('exec-3', 'engine unavailable — circuit open');

        expect(mockDb.execution.update).toHaveBeenCalledWith({
            where: { id: 'exec-3' },
            data: {
                status: 'skipped',
                errorDetails: 'engine unavailable — circuit open',
            },
        });
    });
});

describe('getExecution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns the execution when found', async () => {
        const mockExecution = { id: 'exec-1', status: 'success' };
        mockDb.execution.findUnique.mockResolvedValue(mockExecution);

        const result = await getExecution('exec-1');

        expect(result).toEqual(mockExecution);
        expect(mockDb.execution.findUnique).toHaveBeenCalledWith({
            where: { id: 'exec-1' },
        });
    });

    it('returns null when execution is not found', async () => {
        mockDb.execution.findUnique.mockResolvedValue(null);

        const result = await getExecution('nonexistent');

        expect(result).toBeNull();
    });
});

describe('getRunExecutions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns all executions for a run ordered by createdAt', async () => {
        const mockExecutions = [
            { id: 'exec-1', runId: 'run-1' },
            { id: 'exec-2', runId: 'run-1' },
        ];
        mockDb.execution.findMany.mockResolvedValue(mockExecutions);

        const result = await getRunExecutions('run-1');

        expect(result).toEqual(mockExecutions);
        expect(mockDb.execution.findMany).toHaveBeenCalledWith({
            where: { runId: 'run-1' },
            orderBy: { createdAt: 'asc' },
        });
    });
});

describe('incrementRunCounter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('atomically increments the "successful" counter', async () => {
        mockDb.run.update.mockResolvedValue({});

        await incrementRunCounter('run-1', 'successful');

        expect(mockDb.run.update).toHaveBeenCalledWith({
            where: { id: 'run-1' },
            data: { successful: { increment: 1 } },
        });
    });

    it('atomically increments the "failed" counter', async () => {
        mockDb.run.update.mockResolvedValue({});

        await incrementRunCounter('run-1', 'failed');

        expect(mockDb.run.update).toHaveBeenCalledWith({
            where: { id: 'run-1' },
            data: { failed: { increment: 1 } },
        });
    });

    it('atomically increments the "skipped" counter', async () => {
        mockDb.run.update.mockResolvedValue({});

        await incrementRunCounter('run-1', 'skipped');

        expect(mockDb.run.update).toHaveBeenCalledWith({
            where: { id: 'run-1' },
            data: { skipped: { increment: 1 } },
        });
    });
});

describe('finalizeRun', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    /**
     * Helper that sets up $transaction to execute the callback synchronously
     * with a mock transaction object that delegates to the top-level mocks.
     */
    function setupTransaction(runCounters: { successful: number; failed: number; skipped: number }) {
        mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockDb) => Promise<void>) => {
            const tx = {
                run: {
                    findUniqueOrThrow: vi.fn().mockResolvedValue(runCounters),
                    update: vi.fn().mockResolvedValue({}),
                },
            };
            await callback(tx as unknown as typeof mockDb);
            // Expose the inner update mock so tests can inspect it
            (mockDb as unknown as { _txRunUpdate: ReturnType<typeof vi.fn> })._txRunUpdate = tx.run.update;
        });
    }

    it('sets status to "completed" when there are zero failures', async () => {
        setupTransaction({ successful: 5, failed: 0, skipped: 0 });

        await finalizeRun('run-1');

        const txUpdate = (mockDb as unknown as { _txRunUpdate: ReturnType<typeof vi.fn> })._txRunUpdate;
        expect(txUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'run-1' } }),
        );
        const updateData = txUpdate.mock.calls[0][0].data;
        expect(updateData.status).toBe('completed');
        expect(updateData.completedAt).toBeInstanceOf(Date);
    });

    it('sets status to "partial" when some failures but failure rate < 50%', async () => {
        // 3 successful, 1 failed, 0 skipped → failure rate = 1/4 = 25%
        setupTransaction({ successful: 3, failed: 1, skipped: 0 });

        await finalizeRun('run-1');

        const txUpdate = (mockDb as unknown as { _txRunUpdate: ReturnType<typeof vi.fn> })._txRunUpdate;
        const updateData = txUpdate.mock.calls[0][0].data;
        expect(updateData.status).toBe('partial');
    });

    it('sets status to "failed" when failure rate >= 50%', async () => {
        // 1 successful, 1 failed, 0 skipped → failure rate = 1/2 = 50%
        setupTransaction({ successful: 1, failed: 1, skipped: 0 });

        await finalizeRun('run-1');

        const txUpdate = (mockDb as unknown as { _txRunUpdate: ReturnType<typeof vi.fn> })._txRunUpdate;
        const updateData = txUpdate.mock.calls[0][0].data;
        expect(updateData.status).toBe('failed');
    });

    it('sets status to "failed" when failure rate > 50%', async () => {
        // 1 successful, 3 failed → failure rate = 3/4 = 75%
        setupTransaction({ successful: 1, failed: 3, skipped: 0 });

        await finalizeRun('run-1');

        const txUpdate = (mockDb as unknown as { _txRunUpdate: ReturnType<typeof vi.fn> })._txRunUpdate;
        const updateData = txUpdate.mock.calls[0][0].data;
        expect(updateData.status).toBe('failed');
    });

    it('counts skipped executions in the total when computing failure rate', async () => {
        // 3 successful, 1 failed, 6 skipped → total=10, failure rate = 1/10 = 10% → partial
        setupTransaction({ successful: 3, failed: 1, skipped: 6 });

        await finalizeRun('run-1');

        const txUpdate = (mockDb as unknown as { _txRunUpdate: ReturnType<typeof vi.fn> })._txRunUpdate;
        const updateData = txUpdate.mock.calls[0][0].data;
        expect(updateData.status).toBe('partial');
    });
});
