/**
 * Unit tests for persist.ts — metric persistence with mandatory traceability.
 *
 * Validates: Requirement 6.6 (link every metric to its source raw response)
 * Validates: Property 3 (Metric Traceability — metric → execution → raw_response)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Prisma client ────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
    db: {
        metric: {
            create: vi.fn(),
            findUnique: vi.fn(),
        },
        execution: {
            findUnique: vi.fn(),
        },
        $transaction: vi.fn(),
    },
}));

import { db } from '@/lib/db';
import {
    validateTraceability,
    persistMetric,
    persistMetrics,
    getTraceabilityChain,
    type MetricRecord,
} from './persist';

// ── Typed mock helpers ────────────────────────────────────────────────────────

const mockDb = db as unknown as {
    metric: {
        create: ReturnType<typeof vi.fn>;
        findUnique: ReturnType<typeof vi.fn>;
    };
    execution: {
        findUnique: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<MetricRecord> = {}): MetricRecord {
    return {
        workspaceId: 'ws-1',
        runId: 'run-1',
        promptId: 'prompt-1',
        engine: 'chatgpt',
        date: new Date('2024-01-01T00:00:00Z'),
        visibilityScore: 75,
        mentionCount: 2,
        avgPosition: 1.5,
        citationRate: 50,
        wowChange: null,
        rolling4wkAvg: null,
        rawExecutionId: 'exec-1',
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

// ── validateTraceability ──────────────────────────────────────────────────────

describe('validateTraceability', () => {
    it('is valid when rawExecutionId is present', () => {
        const result = validateTraceability(makeRecord({ rawExecutionId: 'exec-42' }));
        expect(result.valid).toBe(true);
        expect(result.reason).toBeUndefined();
    });

    it('is invalid when rawExecutionId is an empty string', () => {
        const result = validateTraceability(makeRecord({ rawExecutionId: '' }));
        expect(result.valid).toBe(false);
        expect(result.reason).toBeTruthy();
    });

    it('is invalid when rawExecutionId is whitespace only', () => {
        const result = validateTraceability(makeRecord({ rawExecutionId: '   ' }));
        expect(result.valid).toBe(false);
    });

    it('is invalid when rawExecutionId is missing', () => {
        // Simulate an upstream caller that forgot to set the link.
        const record = makeRecord();
        delete (record as Partial<MetricRecord>).rawExecutionId;
        const result = validateTraceability(record as MetricRecord);
        expect(result.valid).toBe(false);
        expect(result.reason).toBeTruthy();
    });
});

// ── persistMetric ─────────────────────────────────────────────────────────────

describe('persistMetric', () => {
    it('creates the metric and returns its ID when valid', async () => {
        mockDb.metric.create.mockResolvedValue({ id: 'metric-1' });

        const id = await persistMetric(makeRecord({ rawExecutionId: 'exec-1' }));

        expect(id).toBe('metric-1');
        expect(mockDb.metric.create).toHaveBeenCalledTimes(1);
        const callArg = mockDb.metric.create.mock.calls[0][0];
        expect(callArg.data.rawExecutionId).toBe('exec-1');
        expect(callArg.select).toEqual({ id: true });
    });

    it('throws and does NOT write when rawExecutionId is missing (Property 3)', async () => {
        const record = makeRecord();
        delete (record as Partial<MetricRecord>).rawExecutionId;

        await expect(persistMetric(record as MetricRecord)).rejects.toThrow(
            /rawExecutionId is required/,
        );
        expect(mockDb.metric.create).not.toHaveBeenCalled();
    });

    it('throws when rawExecutionId is an empty string', async () => {
        await expect(
            persistMetric(makeRecord({ rawExecutionId: '' })),
        ).rejects.toThrow();
        expect(mockDb.metric.create).not.toHaveBeenCalled();
    });
});

// ── persistMetrics ────────────────────────────────────────────────────────────

describe('persistMetrics', () => {
    it('persists all records inside a transaction when all are valid', async () => {
        // create() is called to build each promise passed to $transaction.
        mockDb.metric.create.mockReturnValue({ id: 'pending' });
        mockDb.$transaction.mockResolvedValue([{ id: 'm-1' }, { id: 'm-2' }]);

        const count = await persistMetrics([
            makeRecord({ rawExecutionId: 'exec-1' }),
            makeRecord({ rawExecutionId: 'exec-2' }),
        ]);

        expect(count).toBe(2);
        expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
        // The transaction is given one create operation per record.
        const ops = mockDb.$transaction.mock.calls[0][0];
        expect(Array.isArray(ops)).toBe(true);
        expect(ops).toHaveLength(2);
        expect(mockDb.metric.create).toHaveBeenCalledTimes(2);
    });

    it('returns 0 and skips the transaction for an empty batch', async () => {
        const count = await persistMetrics([]);
        expect(count).toBe(0);
        expect(mockDb.$transaction).not.toHaveBeenCalled();
    });

    it('throws and persists NONE when any record is invalid (all-or-nothing)', async () => {
        mockDb.metric.create.mockReturnValue({ id: 'pending' });

        const records = [
            makeRecord({ rawExecutionId: 'exec-1' }),
            makeRecord({ rawExecutionId: '' }), // invalid — breaks the batch
            makeRecord({ rawExecutionId: 'exec-3' }),
        ];

        await expect(persistMetrics(records)).rejects.toThrow(/index 1/);
        // No writes attempted because validation runs before any create.
        expect(mockDb.metric.create).not.toHaveBeenCalled();
        expect(mockDb.$transaction).not.toHaveBeenCalled();
    });
});

// ── getTraceabilityChain ──────────────────────────────────────────────────────

describe('getTraceabilityChain', () => {
    it('returns the full chain metric → execution → raw_response', async () => {
        mockDb.metric.findUnique.mockResolvedValue({
            id: 'metric-1',
            rawExecutionId: 'exec-1',
        });
        mockDb.execution.findUnique.mockResolvedValue({
            id: 'exec-1',
            rawResponseRef: 'r2/raw/exec-1.json',
            responseChecksum: 'sha256-abc',
        });

        const chain = await getTraceabilityChain('metric-1');

        expect(chain).toEqual({
            metricId: 'metric-1',
            executionId: 'exec-1',
            rawResponseRef: 'r2/raw/exec-1.json',
            responseChecksum: 'sha256-abc',
        });
        expect(mockDb.execution.findUnique).toHaveBeenCalledWith({
            where: { id: 'exec-1' },
            select: { id: true, rawResponseRef: true, responseChecksum: true },
        });
    });

    it('returns null when the metric is not found', async () => {
        mockDb.metric.findUnique.mockResolvedValue(null);

        const chain = await getTraceabilityChain('missing');

        expect(chain).toBeNull();
        expect(mockDb.execution.findUnique).not.toHaveBeenCalled();
    });
});
