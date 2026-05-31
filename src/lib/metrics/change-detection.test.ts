import { describe, it, expect } from 'vitest';
import {
    classifyChange,
    computeWowChange,
    computeBaselineChange,
    DEFAULT_VARIANCE_THRESHOLD,
    DEFAULT_SIGNIFICANT_THRESHOLD,
} from './change-detection';

describe('default thresholds', () => {
    it('sources the variance and significant thresholds from CONFIG_DEFAULTS', () => {
        // Requirement 15.2 (< 10 = normal variance), 15.4 (> 30 = significant)
        expect(DEFAULT_VARIANCE_THRESHOLD).toBe(10);
        expect(DEFAULT_SIGNIFICANT_THRESHOLD).toBe(30);
    });
});

describe('computeWowChange — delta and direction', () => {
    it('reports an upward change when current exceeds previous', () => {
        const change = computeWowChange(70, 50);
        expect(change.delta).toBe(20);
        expect(change.direction).toBe('up');
    });

    it('reports a downward change when current is below previous', () => {
        const change = computeWowChange(50, 70);
        expect(change.delta).toBe(-20);
        expect(change.direction).toBe('down');
    });

    it('reports a flat change when current equals previous', () => {
        const change = computeWowChange(60, 60);
        expect(change.delta).toBe(0);
        expect(change.direction).toBe('flat');
    });

    it('echoes back the current and previous scores', () => {
        const change = computeWowChange(42, 37);
        expect(change.current).toBe(42);
        expect(change.previous).toBe(37);
    });
});

describe('computeWowChange — percentChange', () => {
    it('is null when the previous score is 0', () => {
        const change = computeWowChange(40, 0);
        expect(change.percentChange).toBeNull();
        // delta/direction still meaningful even with a null percent change.
        expect(change.delta).toBe(40);
        expect(change.direction).toBe('up');
    });

    it('computes a positive percentChange (rounded to one decimal)', () => {
        // (60 - 50) / 50 * 100 = 20.0
        const change = computeWowChange(60, 50);
        expect(change.percentChange).toBe(20);
    });

    it('computes a negative percentChange for a decline', () => {
        // (40 - 50) / 50 * 100 = -20.0
        const change = computeWowChange(40, 50);
        expect(change.percentChange).toBe(-20);
    });

    it('rounds percentChange to a single decimal place', () => {
        // (51 - 30) / 30 * 100 = 70.0
        const exact = computeWowChange(51, 30);
        expect(exact.percentChange).toBe(70);
        // (40 - 30) / 30 * 100 = 33.333... → 33.3
        const repeating = computeWowChange(40, 30);
        expect(repeating.percentChange).toBe(33.3);
    });

    it('reports 0 percentChange for a flat change with a non-zero previous', () => {
        const change = computeWowChange(50, 50);
        expect(change.percentChange).toBe(0);
    });
});

describe('classifyChange — boundary semantics', () => {
    it('classifies a sub-threshold change as within_normal_variance (<10)', () => {
        expect(classifyChange(9)).toBe('within_normal_variance');
        expect(classifyChange(0)).toBe('within_normal_variance');
    });

    it('classifies exactly 10 as notable (variance band is strictly <10)', () => {
        expect(classifyChange(10)).toBe('notable');
    });

    it('classifies a mid-range change (20) as notable', () => {
        expect(classifyChange(20)).toBe('notable');
    });

    it('classifies exactly 30 as significant_shift', () => {
        expect(classifyChange(30)).toBe('significant_shift');
    });

    it('classifies a large change (50) as significant_shift', () => {
        expect(classifyChange(50)).toBe('significant_shift');
    });

    it('classifies on magnitude regardless of sign', () => {
        expect(classifyChange(-50)).toBe('significant_shift');
        expect(classifyChange(-5)).toBe('within_normal_variance');
    });
});

describe('classifyChange — custom threshold overrides', () => {
    it('honors a custom variance threshold', () => {
        // With variance=5, a delta of 7 is no longer "normal variance".
        expect(classifyChange(7, 5)).toBe('notable');
        expect(classifyChange(4, 5)).toBe('within_normal_variance');
    });

    it('honors a custom significant threshold', () => {
        // With significant=15, a delta of 20 becomes a significant shift.
        expect(classifyChange(20, 10, 15)).toBe('significant_shift');
        expect(classifyChange(12, 10, 15)).toBe('notable');
    });
});

describe('computeWowChange — classification and custom overrides', () => {
    it('flags a 5-point change (LLM noise) as within_normal_variance', () => {
        // Requirement 15.2 — small changes are noise, not a trend.
        const change = computeWowChange(55, 50);
        expect(change.delta).toBe(5);
        expect(change.classification).toBe('within_normal_variance');
    });

    it('flags a 35-point change as a significant_shift', () => {
        // Requirement 15.4 — large changes are surfaced.
        const change = computeWowChange(85, 50);
        expect(change.delta).toBe(35);
        expect(change.classification).toBe('significant_shift');
    });

    it('flags a large downward swing as a significant_shift', () => {
        const change = computeWowChange(20, 60);
        expect(change.delta).toBe(-40);
        expect(change.direction).toBe('down');
        expect(change.classification).toBe('significant_shift');
    });

    it('applies custom thresholds passed via options', () => {
        // A 12-point change is "notable" by default, but with a lowered
        // significant threshold of 10 it becomes a significant shift.
        const change = computeWowChange(62, 50, { significantThreshold: 10 });
        expect(change.classification).toBe('significant_shift');
    });
});

describe('computeBaselineChange', () => {
    it('returns null because a baseline run has no previous period to compare', () => {
        expect(computeBaselineChange(50)).toBeNull();
        expect(computeBaselineChange(0)).toBeNull();
    });
});
