import { describe, it, expect } from 'vitest';
import {
    rollingAverage,
    rollingAverageSeries,
    DEFAULT_WINDOW_WEEKS,
    type WeeklyScore,
} from './rolling-average';

/** Build a WeeklyScore list from (week, score) tuples for concise fixtures. */
function weeks(...entries: [string, number][]): WeeklyScore[] {
    return entries.map(([week, score]) => ({ week, score }));
}

describe('DEFAULT_WINDOW_WEEKS', () => {
    it('defaults the window to 4 weeks (Requirement 15.3)', () => {
        expect(DEFAULT_WINDOW_WEEKS).toBe(4);
    });
});

describe('rollingAverage', () => {
    it('averages all four weeks when exactly four are provided', () => {
        // (40 + 50 + 60 + 70) / 4 = 55
        const scores = weeks(
            ['2024-W01', 40],
            ['2024-W02', 50],
            ['2024-W03', 60],
            ['2024-W04', 70]
        );
        expect(rollingAverage(scores)).toBe(55);
    });

    it('uses only the most recent four when more than four are provided', () => {
        // Last four are W03..W06: (30 + 40 + 50 + 60) / 4 = 45.
        // The early high weeks (W01=100, W02=100) must be ignored.
        const scores = weeks(
            ['2024-W01', 100],
            ['2024-W02', 100],
            ['2024-W03', 30],
            ['2024-W04', 40],
            ['2024-W05', 50],
            ['2024-W06', 60]
        );
        expect(rollingAverage(scores)).toBe(45);
    });

    it('averages whatever is available when fewer than four weeks exist', () => {
        // (60 + 80) / 2 = 70
        const scores = weeks(['2024-W01', 60], ['2024-W02', 80]);
        expect(rollingAverage(scores)).toBe(70);
    });

    it('returns null for empty input', () => {
        expect(rollingAverage([])).toBeNull();
    });

    it('rounds the average to the nearest integer', () => {
        // (50 + 51 + 52 + 50) / 4 = 50.75 → 51
        const scores = weeks(
            ['2024-W01', 50],
            ['2024-W02', 51],
            ['2024-W03', 52],
            ['2024-W04', 50]
        );
        expect(rollingAverage(scores)).toBe(51);
    });

    it('sorts unsorted input by week before taking the most recent window', () => {
        // Provided out of order; the most recent four chronologically are
        // W03..W06 → (30 + 40 + 50 + 60) / 4 = 45, same as the sorted case.
        const scores = weeks(
            ['2024-W05', 50],
            ['2024-W01', 100],
            ['2024-W06', 60],
            ['2024-W03', 30],
            ['2024-W02', 100],
            ['2024-W04', 40]
        );
        expect(rollingAverage(scores)).toBe(45);
    });

    it('honors a custom window size', () => {
        // Window of 2 → last two weeks: (50 + 70) / 2 = 60.
        const scores = weeks(
            ['2024-W01', 10],
            ['2024-W02', 30],
            ['2024-W03', 50],
            ['2024-W04', 70]
        );
        expect(rollingAverage(scores, 2)).toBe(60);
    });
});

describe('rollingAverageSeries', () => {
    it('produces exactly one entry per input week', () => {
        const scores = weeks(
            ['2024-W01', 40],
            ['2024-W02', 50],
            ['2024-W03', 60],
            ['2024-W04', 70],
            ['2024-W05', 80]
        );
        const series = rollingAverageSeries(scores);
        expect(series).toHaveLength(scores.length);
        expect(series.map((p) => p.week)).toEqual([
            '2024-W01',
            '2024-W02',
            '2024-W03',
            '2024-W04',
            '2024-W05',
        ]);
    });

    it('first entry equals the first score (window of one)', () => {
        const scores = weeks(
            ['2024-W01', 42],
            ['2024-W02', 80],
            ['2024-W03', 90]
        );
        const series = rollingAverageSeries(scores);
        expect(series[0]).toEqual({ week: '2024-W01', rollingAvg: 42 });
    });

    it('smooths a noisy series with the default 4-week window', () => {
        // Noisy weekly scores; verify each rolling point explicitly.
        const scores = weeks(
            ['2024-W01', 20],
            ['2024-W02', 80],
            ['2024-W03', 30],
            ['2024-W04', 70],
            ['2024-W05', 40]
        );
        const series = rollingAverageSeries(scores);
        // W01: [20] → 20
        // W02: [20,80] → 50
        // W03: [20,80,30] → 43.33 → 43
        // W04: [20,80,30,70] → 50
        // W05: [80,30,70,40] → 55
        expect(series).toEqual([
            { week: '2024-W01', rollingAvg: 20 },
            { week: '2024-W02', rollingAvg: 50 },
            { week: '2024-W03', rollingAvg: 43 },
            { week: '2024-W04', rollingAvg: 50 },
            { week: '2024-W05', rollingAvg: 55 },
        ]);
    });

    it('sorts unsorted input by week before computing the series', () => {
        const scores = weeks(
            ['2024-W03', 30],
            ['2024-W01', 20],
            ['2024-W02', 80]
        );
        const series = rollingAverageSeries(scores);
        // After sorting: W01=20, W02=80, W03=30
        // W01: [20] → 20; W02: [20,80] → 50; W03: [20,80,30] → 43
        expect(series).toEqual([
            { week: '2024-W01', rollingAvg: 20 },
            { week: '2024-W02', rollingAvg: 50 },
            { week: '2024-W03', rollingAvg: 43 },
        ]);
    });

    it('honors a custom window size', () => {
        const scores = weeks(
            ['2024-W01', 10],
            ['2024-W02', 30],
            ['2024-W03', 50],
            ['2024-W04', 70]
        );
        // Window of 2:
        // W01: [10] → 10; W02: [10,30] → 20; W03: [30,50] → 40; W04: [50,70] → 60
        const series = rollingAverageSeries(scores, 2);
        expect(series).toEqual([
            { week: '2024-W01', rollingAvg: 10 },
            { week: '2024-W02', rollingAvg: 20 },
            { week: '2024-W03', rollingAvg: 40 },
            { week: '2024-W04', rollingAvg: 60 },
        ]);
    });

    it('returns an empty array for empty input', () => {
        expect(rollingAverageSeries([])).toEqual([]);
    });
});
