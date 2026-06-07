import { describe, it, expect } from 'vitest';
import { runExtraction } from './run-extraction';
import type { MatchableEntity } from './types';

const brand: MatchableEntity = {
    id: 'brand-1',
    type: 'brand',
    name: 'HubSpot',
    aliases: ['Hubspot', 'hubspot'],
    domain: 'hubspot.com',
};

const competitors: MatchableEntity[] = [
    {
        id: 'comp-1',
        type: 'competitor',
        name: 'Salesforce',
        aliases: [],
        domain: 'salesforce.com',
    },
    {
        id: 'comp-2',
        type: 'competitor',
        name: 'Zoho CRM',
        aliases: ['Zoho'],
        domain: 'zoho.com',
    },
];

describe('runExtraction', () => {
    it('detects a brand mention in the first third and reports position', async () => {
        const text =
            'HubSpot is widely regarded as a leading CRM platform. ' +
            'Many teams also evaluate Salesforce and Zoho CRM before deciding.';

        const { result, brandMentionCount } = await runExtraction({
            responseText: text,
            brand,
            competitors,
        });

        expect(result.brandMentioned).toBe(true);
        expect(result.mentionPosition).toBe('first');
        expect(brandMentionCount).toBeGreaterThanOrEqual(1);
        expect(result.confidenceScore).toBe(1.0); // exact match
        expect(result.ambiguous).toBe(false);
    });

    it('also detects competitor mentions across the full text', async () => {
        const text = 'Salesforce and Zoho CRM are common alternatives.';
        const { mentions, result } = await runExtraction({
            responseText: text,
            brand,
            competitors,
        });

        expect(result.brandMentioned).toBe(false);
        const competitorMentions = mentions.filter(
            (m) => m.entityType === 'competitor',
        );
        expect(competitorMentions.length).toBeGreaterThanOrEqual(2);
    });

    it('classifies a brand-domain citation and sets brandCited', async () => {
        const text =
            'For inbound marketing, see the guide at https://hubspot.com/blog/inbound ' +
            'and compare with https://salesforce.com/crm.';

        const { result } = await runExtraction({
            responseText: text,
            brand,
            competitors,
        });

        expect(result.brandCited).toBe(true);
        const classes = result.citations.map((c) => c.classification).sort();
        expect(classes).toContain('brand');
        expect(classes).toContain('competitor');
    });

    it('merges engine-provided citations with text-extracted ones (deduped)', async () => {
        const text = 'See https://hubspot.com/pricing for details.';
        const { result } = await runExtraction({
            responseText: text,
            responseCitations: [
                { url: 'https://hubspot.com/pricing', domain: 'hubspot.com', classification: 'other' },
                { url: 'https://g2.com/hubspot', domain: 'g2.com', classification: 'other' },
            ],
            brand,
            competitors,
        });

        // hubspot.com/pricing appears in both — must not double-count.
        const hubspotPricing = result.citations.filter(
            (c) => c.url === 'https://hubspot.com/pricing',
        );
        expect(hubspotPricing).toHaveLength(1);
        expect(result.brandCited).toBe(true);
    });

    it('returns a valid empty result for a no-information response', async () => {
        const { result, brandMentionCount } = await runExtraction({
            responseText: "I don't have information about that.",
            brand,
            competitors,
        });

        expect(result.brandMentioned).toBe(false);
        expect(result.mentionPosition).toBeNull();
        expect(result.recommendationStrength).toBe('none');
        expect(result.brandCited).toBe(false);
        expect(result.confidenceScore).toBe(1.0);
        expect(brandMentionCount).toBe(0);
    });

    it('handles empty input without throwing', async () => {
        const { result } = await runExtraction({
            responseText: '',
            brand,
            competitors,
        });
        expect(result.brandMentioned).toBe(false);
        expect(result.citations).toEqual([]);
    });
});
