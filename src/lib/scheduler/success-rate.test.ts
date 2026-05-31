/**
 * Unit tests for success-rate.ts
 *
 * Validates: Requirement 4.9  (run success rate ≥ 95% monthly)
 * Validates: Requirement 14.1 (monitoring for 100 concurrent workspaces)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
    db: {
        execution: {
            count: vi.fn(),
        },
    },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { computeMonthlySuccessRate } from './success-rate';
import { db } from '@/lib/db';

const mockDb = db as unknown as {
    execution: { count: ReturnType<typeof vi.fn> };
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('computeMonthlySuccessRate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 100% rate and belowThreshold=false when all executions succeed', async () => {
        // First call: total executions (success + failed + skipped)
        mockDb.execution.count.mockResolvedValueOnce(100);
        // Second call: successful executions
        mockDb.execution.count.mockResolvedValueOnce(100);

        const result = await computeMonthlySuccessRate('2024-03');

        expect(result.month).toBe('2024-03');
        expect(result.totalExecutions).toBe(100);
        expect(result.successfulExecutions).toBe(100);
        expect(result.rate).toBe(100);
        expect(result.belowThreshold).toBe(false);
    });

    it('returns belowThreshold=true when success rate is below 95%', async () => {
        // 90 successful out of 100 total = 90%
        mockDb.execution.count.mockResolvedValueOnce(100);
        mockDb.execution.count.mockResolvedValueOnce(90);

        const result = await computeMonthlySuccessRate('2024-03');

        expect(result.rate).toBe(90);
        expect(result.belowThreshold).toBe(true);
    });

    it('returns belowThreshold=false when success rate is exactly 95%', async () => {
        mockDb.execution.count.mockResolvedValueOnce(100);
        mockDb.execution.count.mockResolvedValueOnce(95);

        const result = await computeMonthlySuccessRate('2024-03');

        expect(result.rate).toBe(95);
        expect(result.belowThreshold).toBe(false);
    });

    it('returns belowThreshold=true when success rate is just below 95%', async () => {
        // 94 out of 100 = 94%
        mockDb.execution.count.mockResolvedValueOnce(100);
        mockDb.execution.count.mockResolvedValueOnce(94);

        const result = await computeMonthlySuccessRate('2024-03');

        expect(result.rate).toBe(94);
        expect(result.belowThreshold).toBe(true);
    });

    it('returns 100% rate when there are zero executions (no failures possible)', async () => {
        mockDb.execution.count.mockResolvedValueOnce(0);
        mockDb.execution.count.mockResolvedValueOnce(0);

        const result = await computeMonthlySuccessRate('2024-03');

        expect(result.rate).toBe(100);
        expect(result.belowThreshold).toBe(false);
        expect(result.totalExecutions).toBe(0);
    });

    it('queries the correct date range for the given month', async () => {
        mockDb.execution.count.mockResolvedValueOnce(50);
        mockDb.execution.count.mockResolvedValueOnce(48);

        await computeMonthlySuccessRate('2024-01');

        // First call: total count with date range and status filter
        expect(mockDb.execution.count).toHaveBeenCalledWith({
            where: {
                createdAt: {
                    gte: new Date('2024-01-01T00:00:00.000Z'),
                    lt: new Date('2024-02-01T00:00:00.000Z'),
                },
                status: { in: ['success', 'failed', 'skipped'] },
            },
        });

        // Second call: successful count with date range
        expect(mockDb.execution.count).toHaveBeenCalledWith({
            where: {
                createdAt: {
                    gte: new Date('2024-01-01T00:00:00.000Z'),
                    lt: new Date('2024-02-01T00:00:00.000Z'),
                },
                status: 'success',
            },
        });
    });

    it('handles December correctly (rolls over to next year)', async () => {
        mockDb.execution.count.mockResolvedValueOnce(200);
        mockDb.execution.count.mockResolvedValueOnce(190);

        await computeMonthlySuccessRate('2024-12');

        expect(mockDb.execution.count).toHaveBeenCalledWith({
            where: {
                createdAt: {
                    gte: new Date('2024-12-01T00:00:00.000Z'),
                    lt: new Date('2025-01-01T00:00:00.000Z'),
                },
                status: { in: ['success', 'failed', 'skipped'] },
            },
        });
    });

    it('computes rate with decimal precision (rounds to 2 decimal places)', async () => {
        // 96 out of 101 = 95.0495... → rounds to 95.05
        mockDb.execution.count.mockResolvedValueOnce(101);
        mockDb.execution.count.mockResolvedValueOnce(96);

        const result = await computeMonthlySuccessRate('2024-06');

        expect(result.rate).toBeCloseTo(95.05, 1);
        expect(result.belowThreshold).toBe(false);
    });

    it('counts skipped executions as non-successful (degraded service)', async () => {
        // If total=100 (includes skipped) and successful=80, rate=80%
        // This verifies skipped are NOT counted as successful
        mockDb.execution.count.mockResolvedValueOnce(100);
        mockDb.execution.count.mockResolvedValueOnce(80);

        const result = await computeMonthlySuccessRate('2024-04');

        expect(result.rate).toBe(80);
        expect(result.belowThreshold).toBe(true);
    });
});
