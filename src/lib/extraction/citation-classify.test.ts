/**
 * Unit tests for citation classification (PRD §F5c).
 */

import { describe, it, expect } from 'vitest';
import { classifyCitation, classifyCitations } from './citation-classify';
import type { ExtractionEntity } from './types';

const BRAND_DOMAIN = 'measurex.io';
const COMPETITORS: ExtractionEntity[] = [
    { id: 'c1', name: 'Otterly', domain: 'otterly.ai' },
    { id: 'c2', name: 'Peec', domain: 'peec.ai' },
];

describe('classifyCitation', () => {
    it('classifies the brand domain as owned', () => {
        expect(classifyCitation('https://measurex.io/blog', BRAND_DOMAIN, COMPETITORS)).toEqual({
            classification: 'owned',
        });
    });

    it('classifies a competitor domain and records its name', () => {
        expect(classifyCitation('https://otterly.ai/pricing', BRAND_DOMAIN, COMPETITORS)).toEqual({
            classification: 'competitor',
            competitorName: 'Otterly',
        });
    });

    it('classifies known review sites, publications and forums', () => {
        expect(classifyCitation('g2.com', BRAND_DOMAIN, COMPETITORS).classification).toBe('review_site');
        expect(classifyCitation('https://www.forbes.com/x', BRAND_DOMAIN, COMPETITORS).classification).toBe('publication');
        expect(classifyCitation('https://reddit.com/r/saas', BRAND_DOMAIN, COMPETITORS).classification).toBe('forum');
    });

    it('classifies unknown domains as other', () => {
        expect(classifyCitation('https://example.com', BRAND_DOMAIN, COMPETITORS).classification).toBe('other');
    });
});

describe('classifyCitations', () => {
    it('builds classified citation results and drops empties / dupes', () => {
        const out = classifyCitations(
            ['https://measurex.io/a', 'https://measurex.io/a', 'https://g2.com/x', ''],
            BRAND_DOMAIN,
            COMPETITORS,
        );
        expect(out).toHaveLength(2);
        expect(out[0]).toEqual({ url: 'https://measurex.io/a', domain: 'measurex.io', classification: 'owned' });
        expect(out[1].classification).toBe('review_site');
    });
});
