/**
 * Unit tests for citation classification.
 *
 * Requirement 5.4: classify each citation as brand, competitor, or third-party.
 * Requirement 6.7 design note: third-party further split into review site,
 * publication, forum, and other.
 *
 * Covers: brand / competitor / review_site / publication / forum / other
 * classification, subdomain collapsing, brand priority, case-insensitivity,
 * array processing, empty competitor list, and malformed/empty domain safety.
 */

import { describe, it, expect } from 'vitest';
import {
    classifyCitation,
    classifyCitations,
    REVIEW_SITE_DOMAINS,
    PUBLICATION_DOMAINS,
    FORUM_DOMAINS,
    type CompetitorDomain,
} from './citation-classify';
import type { Citation } from '@/types';

const BRAND_DOMAIN = 'hubspot.com';

const COMPETITORS: CompetitorDomain[] = [
    { entityId: 'c1', domain: 'salesforce.com' },
    { entityId: 'c2', domain: 'zoho.com' },
    { entityId: 'c3', domain: 'pipedrive.com' },
];

describe('classifyCitation', () => {
    it('classifies the brand domain as "brand"', () => {
        expect(classifyCitation('hubspot.com', BRAND_DOMAIN, COMPETITORS)).toBe('brand');
    });

    it('classifies a subdomain of the brand as "brand"', () => {
        expect(classifyCitation('https://blog.hubspot.com/crm', BRAND_DOMAIN, COMPETITORS)).toBe(
            'brand',
        );
    });

    it('classifies a competitor domain as "competitor"', () => {
        expect(classifyCitation('https://www.salesforce.com/pricing', BRAND_DOMAIN, COMPETITORS)).toBe(
            'competitor',
        );
    });

    it('classifies a subdomain of a competitor as "competitor"', () => {
        expect(classifyCitation('https://help.zoho.com/portal', BRAND_DOMAIN, COMPETITORS)).toBe(
            'competitor',
        );
    });

    it('classifies a known review site (g2.com) as "review_site"', () => {
        expect(classifyCitation('https://www.g2.com/products/hubspot', BRAND_DOMAIN, COMPETITORS)).toBe(
            'review_site',
        );
    });

    it('classifies a known publication (techcrunch.com) as "publication"', () => {
        expect(classifyCitation('https://techcrunch.com/2024/01/01/crm', BRAND_DOMAIN, COMPETITORS)).toBe(
            'publication',
        );
    });

    it('classifies a known forum (reddit.com) as "forum"', () => {
        expect(classifyCitation('https://www.reddit.com/r/sales', BRAND_DOMAIN, COMPETITORS)).toBe(
            'forum',
        );
    });

    it('classifies an unknown domain as "other"', () => {
        expect(classifyCitation('https://some-random-blog.example/post', BRAND_DOMAIN, COMPETITORS)).toBe(
            'other',
        );
    });

    it('gives brand priority over every other category', () => {
        // Even if the brand domain were also (hypothetically) a review site,
        // brand wins. Here we verify brand beats a competitor entry too.
        const competitorsIncludingBrand: CompetitorDomain[] = [
            ...COMPETITORS,
            { entityId: 'rogue', domain: 'hubspot.com' },
        ];
        expect(classifyCitation('hubspot.com', BRAND_DOMAIN, competitorsIncludingBrand)).toBe('brand');
    });

    it('matches case-insensitively', () => {
        expect(classifyCitation('https://HubSpot.COM/Blog', BRAND_DOMAIN, COMPETITORS)).toBe('brand');
        expect(classifyCitation('https://WWW.SALESFORCE.com', BRAND_DOMAIN, COMPETITORS)).toBe(
            'competitor',
        );
        expect(classifyCitation('https://G2.com/products', BRAND_DOMAIN, COMPETITORS)).toBe(
            'review_site',
        );
    });

    it('handles an empty competitor list', () => {
        expect(classifyCitation('https://salesforce.com', BRAND_DOMAIN, [])).toBe('other');
        expect(classifyCitation('hubspot.com', BRAND_DOMAIN, [])).toBe('brand');
    });

    it('returns "other" for empty input', () => {
        expect(classifyCitation('', BRAND_DOMAIN, COMPETITORS)).toBe('other');
    });

    it('does not throw and returns "other" for malformed input', () => {
        expect(() => classifyCitation('not a url !!!', BRAND_DOMAIN, COMPETITORS)).not.toThrow();
        // A garbage token normalizes to a single label, which matches nothing.
        expect(classifyCitation('!!!', BRAND_DOMAIN, COMPETITORS)).toBe('other');
    });

    it('still classifies the brand when the brand domain is passed with protocol/path', () => {
        expect(classifyCitation('hubspot.com', 'https://www.hubspot.com/home', COMPETITORS)).toBe(
            'brand',
        );
    });
});

describe('classifyCitations', () => {
    it('classifies an array of citations correctly and mutates classification', () => {
        const citations: Citation[] = [
            { url: 'https://blog.hubspot.com/crm', domain: 'hubspot.com', classification: 'other' },
            { url: 'https://salesforce.com/pricing', domain: 'salesforce.com', classification: 'other' },
            { url: 'https://g2.com/products', domain: 'g2.com', classification: 'other' },
            { url: 'https://forbes.com/article', domain: 'forbes.com', classification: 'other' },
            { url: 'https://quora.com/q', domain: 'quora.com', classification: 'other' },
            { url: 'https://example.org/post', domain: 'example.org', classification: 'other' },
        ];

        const result = classifyCitations(citations, BRAND_DOMAIN, COMPETITORS);

        expect(result).toBe(citations); // returns the same array
        expect(result.map((c) => c.classification)).toEqual([
            'brand',
            'competitor',
            'review_site',
            'publication',
            'forum',
            'other',
        ]);
    });

    it('returns an empty array unchanged', () => {
        expect(classifyCitations([], BRAND_DOMAIN, COMPETITORS)).toEqual([]);
    });
});

describe('domain list constants', () => {
    it('exposes the documented review site, publication, and forum domains', () => {
        expect(REVIEW_SITE_DOMAINS.has('g2.com')).toBe(true);
        expect(REVIEW_SITE_DOMAINS.has('capterra.com')).toBe(true);
        expect(PUBLICATION_DOMAINS.has('techcrunch.com')).toBe(true);
        expect(PUBLICATION_DOMAINS.has('forbes.com')).toBe(true);
        expect(FORUM_DOMAINS.has('reddit.com')).toBe(true);
        expect(FORUM_DOMAINS.has('quora.com')).toBe(true);
    });
});
