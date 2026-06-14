/**
 * Unit tests for URL extraction and domain normalization (PRD §F5c).
 */

import { describe, it, expect } from 'vitest';
import { extractUrls, normalizeDomain } from './url-extract';

describe('extractUrls', () => {
    it('extracts an http(s) URL and strips trailing punctuation', () => {
        expect(extractUrls('Visit https://measurex.io for details.')).toEqual(['https://measurex.io']);
    });

    it('extracts multiple URLs and de-duplicates', () => {
        const urls = extractUrls('See https://a.com and https://b.com, also https://a.com again.');
        expect(urls).toEqual(['https://a.com', 'https://b.com']);
    });

    it('stops at the PRD delimiter characters', () => {
        expect(extractUrls('(https://x.com/path)')).toEqual(['https://x.com/path']);
    });

    it('returns [] when there are no URLs', () => {
        expect(extractUrls('No links here at all.')).toEqual([]);
    });
});

describe('normalizeDomain', () => {
    it('lowercases, strips protocol, www, path and trailing slash', () => {
        expect(normalizeDomain('https://www.MeasureX.io/blog/post')).toBe('measurex.io');
        expect(normalizeDomain('http://G2.com/')).toBe('g2.com');
    });

    it('handles a bare host', () => {
        expect(normalizeDomain('forbes.com')).toBe('forbes.com');
    });

    it('returns empty string for empty input', () => {
        expect(normalizeDomain('')).toBe('');
    });
});
