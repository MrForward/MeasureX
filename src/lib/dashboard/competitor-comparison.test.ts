import { describe, it, expect } from 'vitest';
import {
    aggregateEntityMentions,
    buildComparisonRows,
    type MentionLike,
} from './competitor-comparison';

const brand = { id: 'b1', name: 'HubSpot' };
const competitors = [
    { id: 'c1', name: 'Salesforce' },
    { id: 'c2', name: 'Zoho CRM' },
];

describe('aggregateEntityMentions', () => {
    it('counts mentions per entity and includes zero-mention entities', () => {
        const mentions: MentionLike[] = [
            { entityId: 'b1', entityType: 'brand' },
            { entityId: 'b1', entityType: 'brand' },
            { entityId: 'c1', entityType: 'competitor' },
        ];
        const counts = aggregateEntityMentions(mentions, brand, competitors);
        expect(counts).toEqual([
            { entityId: 'b1', entityType: 'brand', mentionCount: 2 },
            { entityId: 'c1', entityType: 'competitor', mentionCount: 1 },
            { entityId: 'c2', entityType: 'competitor', mentionCount: 0 },
        ]);
    });

    it('ignores mentions for unknown entities', () => {
        const mentions: MentionLike[] = [{ entityId: 'x9', entityType: 'competitor' }];
        const counts = aggregateEntityMentions(mentions, brand, competitors);
        expect(counts.every((c) => c.mentionCount === 0)).toBe(true);
    });
});

describe('buildComparisonRows', () => {
    it('computes share of voice and sorts by mentions descending', () => {
        const counts = aggregateEntityMentions(
            [
                { entityId: 'b1', entityType: 'brand' },
                { entityId: 'c1', entityType: 'competitor' },
                { entityId: 'c1', entityType: 'competitor' },
                { entityId: 'c1', entityType: 'competitor' },
            ],
            brand,
            competitors,
        );
        const rows = buildComparisonRows(
            counts,
            new Map([
                ['b1', 'HubSpot'],
                ['c1', 'Salesforce'],
                ['c2', 'Zoho CRM'],
            ]),
        );

        expect(rows[0].name).toBe('Salesforce'); // 3 mentions, highest
        expect(rows[0].sharePercent).toBe(75);
        expect(rows.find((r) => r.name === 'HubSpot')?.sharePercent).toBe(25);
        expect(rows.find((r) => r.name === 'Zoho CRM')?.sharePercent).toBe(0);
    });
});
