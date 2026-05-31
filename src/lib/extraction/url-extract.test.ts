/**
 * Unit tests for URL extraction and domain normalization.
 *
 * Requirement 5.3: extract all URLs from a response and normalize them to base
 * domain form for citation analysis.
 *
 * Covers: bare URLs, markdown links, protocol-less www. links, de-duplication,
 * trailing-punctuation stripping, domain normalization (protocol/www/path),
 * multi-part TLDs (.co.uk), malformed input safety, Citation construction, and
 * empty / no-URL inputs.
 */

import { describe, it, expect } from 'vitest';
import { extractUrls, normalizeDomain, extractCitationsFromText } from './url-extract';

describe('extractUrls', () => {
    it('extracts a bare URL with a path', () => {
        const urls = extractUrls('See https://hubspot.com/blog/crm for details.');
        expect(urls).toEqual(['https://hubspot.com/blog/crm']);
    });

    it('extracts the target of a markdown link', () => {
        const urls = extractUrls('Read the [HubSpot guide](https://www.hubspot.com/guide).');
        expect(urls).toContain('https://www.hubspot.com/guide');
    });

    it('does not duplicate a markdown link target when it also looks like a bare URL', () => {
        const urls = extractUrls('[guide](https://example.com/guide)');
        expect(urls).toEqual(['https://example.com/guide']);
    });

    it('extracts a www. URL with no protocol', () => {
        const urls = extractUrls('Visit www.salesforce.com for pricing.');
        expect(urls).toEqual(['www.salesforce.com']);
    });

    it('deduplicates identical URLs', () => {
        const text = 'https://hubspot.com and again https://hubspot.com plus https://hubspot.com';
        expect(extractUrls(text)).toEqual(['https://hubspot.com']);
    });

    it('strips trailing punctuation that is not part of the URL', () => {
        expect(extractUrls('visit https://x.com.')).toEqual(['https://x.com']);
        expect(extractUrls('see https://x.com/path, then leave')).toEqual([
            'https://x.com/path',
        ]);
        expect(extractUrls('(see https://x.com)')).toEqual(['https://x.com']);
    });

    it('preserves balanced parentheses inside a URL', () => {
        const urls = extractUrls('https://en.wikipedia.org/wiki/CRM_(software)');
        expect(urls).toEqual(['https://en.wikipedia.org/wiki/CRM_(software)']);
    });

    it('extracts multiple distinct URLs in order', () => {
        const text = 'Compare https://hubspot.com and https://salesforce.com today.';
        expect(extractUrls(text)).toEqual([
            'https://hubspot.com',
            'https://salesforce.com',
        ]);
    });

    it('handles mixed markdown, bare, and www. URLs together', () => {
        const text =
            'See [docs](https://docs.example.com), or https://blog.example.com, or www.example.org.';
        const urls = extractUrls(text);
        expect(urls).toContain('https://docs.example.com');
        expect(urls).toContain('https://blog.example.com');
        expect(urls).toContain('www.example.org');
        expect(urls).toHaveLength(3);
    });

    it('returns an empty array for empty text', () => {
        expect(extractUrls('')).toEqual([]);
    });

    it('returns an empty array when there are no URLs', () => {
        expect(extractUrls('HubSpot is a great CRM with no links here.')).toEqual([]);
    });

    it('does not throw on non-string input', () => {
        // @ts-expect-error — deliberately exercising malformed runtime input.
        expect(() => extractUrls(null)).not.toThrow();
        // @ts-expect-error — deliberately exercising malformed runtime input.
        expect(extractUrls(undefined)).toEqual([]);
    });
});

describe('normalizeDomain', () => {
    it('strips protocol, www, and path', () => {
        expect(normalizeDomain('https://www.hubspot.com/blog/crm')).toBe('hubspot.com');
    });

    it('strips query string and fragment', () => {
        expect(normalizeDomain('https://example.com/path?utm=x#section')).toBe('example.com');
    });

    it('lowercases the result', () => {
        expect(normalizeDomain('https://HubSpot.COM')).toBe('hubspot.com');
    });

    it('keeps a bare domain unchanged', () => {
        expect(normalizeDomain('salesforce.com')).toBe('salesforce.com');
    });

    it('handles a multi-part .co.uk TLD, keeping the registrable domain', () => {
        expect(normalizeDomain('http://blog.example.co.uk/path')).toBe('example.co.uk');
        expect(normalizeDomain('https://www.example.co.uk')).toBe('example.co.uk');
    });

    it('handles a .com.au TLD', () => {
        expect(normalizeDomain('https://shop.example.com.au/products')).toBe('example.com.au');
    });

    it('reduces a deep subdomain to the registrable domain', () => {
        expect(normalizeDomain('https://a.b.c.hubspot.com')).toBe('hubspot.com');
    });

    it('strips a port', () => {
        expect(normalizeDomain('http://localhost.com:3000/path')).toBe('localhost.com');
    });

    it('returns an empty string for empty input', () => {
        expect(normalizeDomain('')).toBe('');
    });

    it('does not throw on malformed input', () => {
        expect(() => normalizeDomain('not a url at all !!!')).not.toThrow();
        expect(() => normalizeDomain('http://')).not.toThrow();
        // @ts-expect-error — deliberately exercising malformed runtime input.
        expect(() => normalizeDomain(null)).not.toThrow();
        // @ts-expect-error — deliberately exercising malformed runtime input.
        expect(normalizeDomain(undefined)).toBe('');
    });
});

describe('extractCitationsFromText', () => {
    it('returns Citation objects with classification "other"', () => {
        const citations = extractCitationsFromText(
            'Sources: https://www.hubspot.com/crm and https://salesforce.com/pricing.',
        );
        expect(citations).toHaveLength(2);
        expect(citations.every((c) => c.classification === 'other')).toBe(true);
    });

    it('populates url and normalized domain on each citation', () => {
        const [citation] = extractCitationsFromText('Read https://www.hubspot.com/blog/crm here.');
        expect(citation.url).toBe('https://www.hubspot.com/blog/crm');
        expect(citation.domain).toBe('hubspot.com');
    });

    it('returns an empty array for empty text', () => {
        expect(extractCitationsFromText('')).toEqual([]);
    });

    it('returns an empty array when there are no URLs', () => {
        expect(extractCitationsFromText('No links in this sentence.')).toEqual([]);
    });

    it('deduplicates citations sharing the same URL', () => {
        const citations = extractCitationsFromText(
            'https://hubspot.com mentioned twice: https://hubspot.com',
        );
        expect(citations).toHaveLength(1);
        expect(citations[0].domain).toBe('hubspot.com');
    });
});
