/**
 * Unit tests for the weekly scheduler.
 *
 * Validates: Requirement 4.1 (weekly scheduled runs)
 *
 * Mocks: Prisma, QStash, config — no real DB or network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
    db: {
        workspace: { findMany: vi.fn() },
        run: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
        prompt: { findMany: vi.fn() },
    },
}));

vi.mock('@/lib/queue/qstash', () => ({
    publishJob: vi.fn(),
}));

vi.mock('@/lib/engines/execution-store', () => ({
    createExecution: vi.fn(),
}));

vi.mock('@/lib/config', () => ({
    config: { get: vi.fn() },
}));

import { db } from '@/lib/db';
import { publishJob } from '@/lib/queue/qstash';
import { createExecution } from '@/lib/engines/execution-store';
import { config } from '@/lib/config';
import {
    getCurrentISOWeek,
    scheduleWeeklyRuns,
    scheduleWorkspaceRun,
} from './weekly-scheduler';

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockDb = db as unknown as {
    workspace: { findMany: ReturnType<typeof vi.fn> };
    run: {
        findUnique: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
    };
    prompt: { findMany: ReturnType<typeof vi.fn> };
};

const mockConfig = config as unknown as { get: ReturnType<typeof vi.fn> };
const mockPublishJob = publishJob as ReturnType<typeof vi.fn>;
const mockCreateExecution = createExecution as ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.clearAllMocks();
});

// ── getCurrentISOWeek ─────────────────────────────────────────────────────────

describe('getCurrentISOWeek', () => {
    it('returns a string matching "YYYY-Www" format', () => {
        const result = getCurrentISOWeek();
        expect(result).toMatch(/^\d{4}-W\d{2}$/);
    });

    it('returns correct week for a known date', () => {
        // 2024-01-15 is a Monday in week 3
        const result = getCurrentISOWeek(new Date('2024-01-15'));
        expect(result).toBe('2024-W03');
    });

    it('handles year boundary correctly', () => {
        // 2023-01-01 is a Sunday — ISO week 52 of 2022
        const result = getCurrentISOWeek(new Date('2023-01-01'));
        expect(result).toBe('2022-W52');
    });
});

// ── scheduleWeeklyRuns ────────────────────────────────────────────────────────

describe('scheduleWeeklyRuns', () => {
    it('returns immediately when kill switch is active', async () => {
        mockConfig.get.mockResolvedValue(true);

        const result = await scheduleWeeklyRuns();

        expect(result.scheduled).toBe(0);
        expect(result.skipped).toBe(0);
        expect(result.errors).toEqual([]);
        expect(mockDb.workspace.findMany).not.toHaveBeenCalled();
    });

    it('schedules runs for all active workspaces', async () => {
        mockConfig.get.mockResolvedValue(false);
        mockDb.workspace.findMany.mockResolvedValue([
            { id: 'ws-1' },
            { id: 'ws-2' },
        ]);
        // Both workspaces have no existing run and have active prompts
        mockDb.run.findUnique.mockResolvedValue(null);
        mockDb.prompt.findMany.mockResolvedValue([
            { id: 'p-1', engines: ['chatgpt'] },
        ]);
        mockDb.run.create.mockResolvedValue({ id: 'run-1' });
        mockDb.run.update.mockResolvedValue({});
        mockCreateExecution.mockResolvedValue('exec-1');
        mockPublishJob.mockResolvedValue(undefined);

        const result = await scheduleWeeklyRuns();

        expect(result.scheduled).toBe(2);
        expect(result.skipped).toBe(0);
        expect(result.errors).toEqual([]);
    });

    it('skips deleted workspaces (only queries non-deleted)', async () => {
        mockConfig.get.mockResolvedValue(false);
        mockDb.workspace.findMany.mockResolvedValue([]);

        const result = await scheduleWeeklyRuns();

        expect(mockDb.workspace.findMany).toHaveBeenCalledWith({
            where: { deletedAt: null },
            select: { id: true },
        });
        expect(result.scheduled).toBe(0);
    });

    it('records errors for workspaces that throw', async () => {
        mockConfig.get.mockResolvedValue(false);
        mockDb.workspace.findMany.mockResolvedValue([
            { id: 'ws-ok' },
            { id: 'ws-fail' },
        ]);

        // First workspace succeeds
        mockDb.run.findUnique
            .mockResolvedValueOnce(null) // ws-ok: no existing run
            .mockRejectedValueOnce(new Error('DB error')); // ws-fail: throws

        mockDb.prompt.findMany.mockResolvedValue([
            { id: 'p-1', engines: ['chatgpt'] },
        ]);
        mockDb.run.create.mockResolvedValue({ id: 'run-1' });
        mockDb.run.update.mockResolvedValue({});
        mockCreateExecution.mockResolvedValue('exec-1');
        mockPublishJob.mockResolvedValue(undefined);

        const result = await scheduleWeeklyRuns();

        expect(result.scheduled).toBe(1);
        expect(result.errors).toContain('ws-fail');
    });
});

// ── scheduleWorkspaceRun ──────────────────────────────────────────────────────

describe('scheduleWorkspaceRun', () => {
    it('creates a run and returns the ID', async () => {
        mockDb.run.findUnique.mockResolvedValue(null);
        mockDb.prompt.findMany.mockResolvedValue([
            { id: 'p-1', engines: ['chatgpt'] },
        ]);
        mockDb.run.create.mockResolvedValue({ id: 'run-abc' });
        mockDb.run.update.mockResolvedValue({});
        mockCreateExecution.mockResolvedValue('exec-1');
        mockPublishJob.mockResolvedValue(undefined);

        const result = await scheduleWorkspaceRun('ws-1', '2024-W03');

        expect(result).toBe('run-abc');
        expect(mockDb.run.create).toHaveBeenCalledWith({
            data: {
                workspaceId: 'ws-1',
                type: 'scheduled',
                status: 'queued',
                week: '2024-W03',
            },
        });
    });

    it('returns null (idempotent skip) when run already exists for this week', async () => {
        mockDb.run.findUnique.mockResolvedValue({ id: 'existing-run' });

        const result = await scheduleWorkspaceRun('ws-1', '2024-W03');

        expect(result).toBeNull();
        expect(mockDb.run.create).not.toHaveBeenCalled();
    });

    it('skips workspaces with no active prompts', async () => {
        mockDb.run.findUnique.mockResolvedValue(null);
        mockDb.prompt.findMany.mockResolvedValue([]);

        const result = await scheduleWorkspaceRun('ws-1', '2024-W03');

        expect(result).toBeNull();
        expect(mockDb.run.create).not.toHaveBeenCalled();
    });

    it('creates execution records for each prompt × engine', async () => {
        mockDb.run.findUnique.mockResolvedValue(null);
        mockDb.prompt.findMany.mockResolvedValue([
            { id: 'p-1', engines: ['chatgpt', 'perplexity'] },
            { id: 'p-2', engines: ['google_ai'] },
        ]);
        mockDb.run.create.mockResolvedValue({ id: 'run-1' });
        mockDb.run.update.mockResolvedValue({});
        mockCreateExecution.mockResolvedValue('exec-id');
        mockPublishJob.mockResolvedValue(undefined);

        await scheduleWorkspaceRun('ws-1', '2024-W03');

        // 2 engines for p-1 + 1 engine for p-2 = 3 executions
        expect(mockCreateExecution).toHaveBeenCalledTimes(3);
        expect(mockCreateExecution).toHaveBeenCalledWith({
            runId: 'run-1',
            promptId: 'p-1',
            engine: 'chatgpt',
            workspaceId: 'ws-1',
        });
        expect(mockCreateExecution).toHaveBeenCalledWith({
            runId: 'run-1',
            promptId: 'p-1',
            engine: 'perplexity',
            workspaceId: 'ws-1',
        });
        expect(mockCreateExecution).toHaveBeenCalledWith({
            runId: 'run-1',
            promptId: 'p-2',
            engine: 'google_ai',
            workspaceId: 'ws-1',
        });

        // totalExecutions updated to 3
        expect(mockDb.run.update).toHaveBeenCalledWith({
            where: { id: 'run-1' },
            data: { totalExecutions: 3 },
        });
    });

    it('publishes jobs to QStash for each execution', async () => {
        mockDb.run.findUnique.mockResolvedValue(null);
        mockDb.prompt.findMany.mockResolvedValue([
            { id: 'p-1', engines: ['chatgpt', 'perplexity'] },
        ]);
        mockDb.run.create.mockResolvedValue({ id: 'run-1' });
        mockDb.run.update.mockResolvedValue({});
        mockCreateExecution.mockResolvedValue('exec-id');
        mockPublishJob.mockResolvedValue(undefined);

        await scheduleWorkspaceRun('ws-1', '2024-W03');

        expect(mockPublishJob).toHaveBeenCalledTimes(2);
        expect(mockPublishJob).toHaveBeenCalledWith('execute', {
            runId: 'run-1',
            promptId: 'p-1',
            engine: 'chatgpt',
            workspaceId: 'ws-1',
            executionId: 'exec-id',
        }, 0);
        expect(mockPublishJob).toHaveBeenCalledWith('execute', {
            runId: 'run-1',
            promptId: 'p-1',
            engine: 'perplexity',
            workspaceId: 'ws-1',
            executionId: 'exec-id',
        }, 0);
    });
});
