import { describe, it, expect } from 'vitest';
import {
    computeRunDelay,
    computeScheduledTime,
    distributeWorkspaces,
    hashString,
} from './distribution';

describe('hashString', () => {
    it('returns a non-negative integer', () => {
        expect(hashString('test')).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(hashString('test'))).toBe(true);
    });

    it('is deterministic', () => {
        expect(hashString('workspace-abc')).toBe(hashString('workspace-abc'));
    });
});

describe('computeRunDelay', () => {
    it('returns a non-negative number', () => {
        const delay = computeRunDelay('ws-1', 10);
        expect(delay).toBeGreaterThanOrEqual(0);
    });

    it('is deterministic — same ID always produces the same delay', () => {
        const delay1 = computeRunDelay('ws-abc-123', 5);
        const delay2 = computeRunDelay('ws-abc-123', 5);
        expect(delay1).toBe(delay2);
    });

    it('different IDs get different delays for a reasonable set', () => {
        const ids = ['ws-1', 'ws-2', 'ws-3', 'ws-4', 'ws-5'];
        const delays = ids.map((id) => computeRunDelay(id, ids.length));
        const uniqueDelays = new Set(delays);
        // With 5 distinct IDs and djb2 hash, we expect at least some different delays
        expect(uniqueDelays.size).toBeGreaterThan(1);
    });

    it('delay is within [0, windowMs)', () => {
        const windowMs = 86_400_000; // 24h
        const ids = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];
        for (const id of ids) {
            const delay = computeRunDelay(id, ids.length, windowMs);
            expect(delay).toBeGreaterThanOrEqual(0);
            expect(delay).toBeLessThan(windowMs);
        }
    });

    it('respects custom windowMs', () => {
        const customWindow = 3_600_000; // 1 hour
        const delay = computeRunDelay('ws-test', 10, customWindow);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThan(customWindow);
    });

    it('returns 0 when totalWorkspaces is 0', () => {
        const delay = computeRunDelay('ws-1', 0);
        expect(delay).toBe(0);
    });
});

describe('computeScheduledTime', () => {
    it('returns baseTime + delay', () => {
        const baseTime = new Date('2024-01-15T00:00:00Z');
        const scheduled = computeScheduledTime('ws-1', 5, baseTime);
        const expectedDelay = computeRunDelay('ws-1', 5);
        expect(scheduled.getTime()).toBe(baseTime.getTime() + expectedDelay);
    });
});

describe('distributeWorkspaces', () => {
    it('returns entries sorted by delay ascending', () => {
        const ids = ['ws-a', 'ws-b', 'ws-c', 'ws-d', 'ws-e'];
        const baseTime = new Date('2024-01-15T00:00:00Z');
        const result = distributeWorkspaces(ids, baseTime);

        for (let i = 1; i < result.length; i++) {
            expect(result[i].delayMs).toBeGreaterThanOrEqual(result[i - 1].delayMs);
        }
    });

    it('all delays are within the window', () => {
        const ids = ['ws-1', 'ws-2', 'ws-3', 'ws-4', 'ws-5'];
        const windowMs = 86_400_000;
        const result = distributeWorkspaces(ids, new Date(), windowMs);

        for (const entry of result) {
            expect(entry.delayMs).toBeGreaterThanOrEqual(0);
            expect(entry.delayMs).toBeLessThan(windowMs);
        }
    });

    it('scheduledAt equals baseTime + delay', () => {
        const baseTime = new Date('2024-06-01T08:00:00Z');
        const ids = ['ws-x', 'ws-y', 'ws-z'];
        const result = distributeWorkspaces(ids, baseTime);

        for (const entry of result) {
            expect(entry.scheduledAt.getTime()).toBe(baseTime.getTime() + entry.delayMs);
        }
    });

    it('handles single workspace', () => {
        const baseTime = new Date('2024-01-01T00:00:00Z');
        const result = distributeWorkspaces(['ws-only'], baseTime);

        expect(result).toHaveLength(1);
        expect(result[0].workspaceId).toBe('ws-only');
        expect(result[0].delayMs).toBe(0);
        expect(result[0].scheduledAt.getTime()).toBe(baseTime.getTime());
    });

    it('handles empty list', () => {
        const result = distributeWorkspaces([]);
        expect(result).toEqual([]);
    });
});
