import { describe, it, expect } from 'vitest';
import {
    computeShareOfVoice,
    brandShareOfVoice,
    type EntityMentionCount,
    type ShareOfVoice,
} from './share-of-voice';

/** Build a brand mention-count entry. */
function brand(mentionCount: number, entityId = 'brand'): EntityMentionCount {
    return { entityId, entityType: 'brand', mentionCount };
}

/** Build a competitor mention-count entry. */
function competitor(
    entityId: string,
    mentionCount: number
): EntityMentionCount {
    return { entityId, entityType: 'competitor', mentionCount };
}

describe('computeShareOfVoice', () => {
    it('splits shares proportionally (brand 60, competitor 40 → 60% / 40%)', () => {
        const result = computeShareOfVoice([
            brand(60),
            competitor('comp-1', 40),
        ]);
        expect(result).toEqual<ShareOfVoice[]>([
            {
                entityId: 'brand',
                entityType: 'brand',
                mentionCount: 60,
                sharePercent: 60,
            },
            {
                entityId: 'comp-1',
                entityType: 'competitor',
                mentionCount: 40,
                sharePercent: 40,
            },
        ]);
    });

    it('gives equal mentions equal shares', () => {
        const result = computeShareOfVoice([
            brand(10),
            competitor('comp-1', 10),
            competitor('comp-2', 10),
        ]);
        // 10 of 30 = 33.33... → 33.3 for each entity.
        expect(result.map((r) => r.sharePercent)).toEqual([33.3, 33.3, 33.3]);
    });

    it('returns all-zero shares when total mentions is zero', () => {
        const result = computeShareOfVoice([
            brand(0),
            competitor('comp-1', 0),
            competitor('comp-2', 0),
        ]);
        expect(result.map((r) => r.sharePercent)).toEqual([0, 0, 0]);
    });

    it('produces shares that sum to ~100 within rounding tolerance', () => {
        const result = computeShareOfVoice([
            brand(1),
            competitor('comp-1', 1),
            competitor('comp-2', 1),
        ]);
        const sum = result.reduce((acc, r) => acc + r.sharePercent, 0);
        // Three independently-rounded 33.3 values sum to 99.9, not exactly 100.
        expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.3);
    });

    it('rounds shares to one decimal place', () => {
        const result = computeShareOfVoice([
            brand(1),
            competitor('comp-1', 2),
        ]);
        // 1 of 3 = 33.33... → 33.3, 2 of 3 = 66.66... → 66.7.
        expect(result[0].sharePercent).toBe(33.3);
        expect(result[1].sharePercent).toBe(66.7);
    });

    it('preserves the input entity order', () => {
        const ids = computeShareOfVoice([
            competitor('zoho', 5),
            brand(10),
            competitor('salesforce', 5),
        ]).map((r) => r.entityId);
        expect(ids).toEqual(['zoho', 'brand', 'salesforce']);
    });

    it('gives a single entity the full 100% share', () => {
        const result = computeShareOfVoice([brand(7)]);
        expect(result).toEqual<ShareOfVoice[]>([
            {
                entityId: 'brand',
                entityType: 'brand',
                mentionCount: 7,
                sharePercent: 100,
            },
        ]);
    });

    it('handles empty input', () => {
        expect(computeShareOfVoice([])).toEqual([]);
    });
});

describe('brandShareOfVoice', () => {
    it("returns the brand's share of voice", () => {
        expect(
            brandShareOfVoice([brand(75), competitor('comp-1', 25)])
        ).toBe(75);
    });

    it('returns 0 when the brand has no mentions', () => {
        expect(
            brandShareOfVoice([brand(0), competitor('comp-1', 50)])
        ).toBe(0);
    });

    it('returns 0 when there is no brand entity present', () => {
        expect(
            brandShareOfVoice([
                competitor('comp-1', 30),
                competitor('comp-2', 70),
            ])
        ).toBe(0);
    });

    it('returns 0 when there are no mentions at all', () => {
        expect(
            brandShareOfVoice([brand(0), competitor('comp-1', 0)])
        ).toBe(0);
    });

    it('returns 100 when only the brand has mentions among entities', () => {
        expect(
            brandShareOfVoice([brand(12), competitor('comp-1', 0)])
        ).toBe(100);
    });
});
