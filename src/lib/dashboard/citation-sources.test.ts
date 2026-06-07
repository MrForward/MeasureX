import { describe, it, expect } from 'vitest';
import { aggregateCitations } from './citation-sources';
import type { Citation } from '@/types';

function cite(domain: string, classification: Citation['classification']): Citation {
    return { url: `https://${domain}/x`, domain, classification };
}

describe('aggregateCitations', () => {
    it('groups by domain with frequency counts, sorted by count desc', () => {
        const sources = aggregateCitations([
            cite('hubspot.com', 'brand'),
            cite('g2.com', 'review_site'),
            cite('hubspot.com', 'brand'),
            cite('hubspot.com', 'brand'),
            cite('g2.com', 'review_site'),
        ]);
        expect(sources).toEqual([
            { domain: 'hubspot.com', count: 3, classification: 'brand' },
            { domain: 'g2.com', count: 2, classification: 'review_site' },
        ]);
    });

    it('preserves each domain classification', () => {
        const sources = aggregateCitations([
            cite('salesforce.com', 'competitor'),
            cite('forbes.com', 'publication'),
        ]);
        expect(sources.find((s) => s.domain === 'salesforce.com')?.classification).toBe('competitor');
        expect(sources.find((s) => s.domain === 'forbes.com')?.classification).toBe('publication');
    });

    it('breaks count ties alphabetically by domain', () => {
        const sources = aggregateCitations([cite('zebra.com', 'other'), cite('apple.com', 'other')]);
        expect(sources.map((s) => s.domain)).toEqual(['apple.com', 'zebra.com']);
    });

    it('ignores citations with an empty domain', () => {
        const sources = aggregateCitations([cite('', 'other'), cite('ok.com', 'other')]);
        expect(sources).toHaveLength(1);
        expect(sources[0].domain).toBe('ok.com');
    });

    it('returns an empty array for no citations', () => {
        expect(aggregateCitations([])).toEqual([]);
    });
});
