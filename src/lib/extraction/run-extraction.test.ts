/**
 * F5 Extraction-accuracy eval (PRD §F5, "Extraction accuracy test (CRITICAL)").
 *
 * The 10 synthetic cases below mirror the PRD table exactly. Pass threshold:
 * 10/10. Extraction accuracy is non-negotiable.
 */

import { describe, it, expect } from 'vitest';
import { runExtraction } from './run-extraction';
import type { ExtractionEntity } from './types';

const BRAND: ExtractionEntity = { id: 'brand', name: 'MeasureX', domain: 'measurex.io' };
const OTTERLY: ExtractionEntity = { id: 'c-otterly', name: 'Otterly', domain: 'otterly.ai' };
const PEEC: ExtractionEntity = { id: 'c-peec', name: 'Peec', domain: 'peec.ai' };

describe('F5 extraction eval', () => {
    it('Test 1 — clean mention', () => {
        const r = runExtraction({
            responseText: 'MeasureX is a good tool for monitoring.',
            brand: BRAND,
            competitors: [OTTERLY, PEEC],
        });
        expect(r.brandMentioned).toBe(true);
        expect(r.brandPosition).toBe(1);
        expect(r.brandRecommendation).toBe('MENTIONED');
    });

    it('Test 2 — recommendation', () => {
        const r = runExtraction({
            responseText: 'I recommend MeasureX for AEO tracking.',
            brand: BRAND,
            competitors: [OTTERLY, PEEC],
        });
        expect(r.brandMentioned).toBe(true);
        expect(r.brandRecommendation).toBe('RECOMMENDED');
    });

    it('Test 3 — negation is not a recommendation', () => {
        const r = runExtraction({
            responseText: "I wouldn't recommend MeasureX for enterprise.",
            brand: BRAND,
            competitors: [OTTERLY, PEEC],
        });
        expect(r.brandMentioned).toBe(true);
        expect(r.brandRecommendation).toBe('MENTIONED');
    });

    it('Test 4 — absent', () => {
        const r = runExtraction({
            responseText: 'Otterly and Peec are the top tools.',
            brand: BRAND,
            competitors: [OTTERLY, PEEC],
        });
        expect(r.brandMentioned).toBe(false);
        expect(r.brandPosition).toBeNull();
        expect(r.brandRecommendation).toBe('ABSENT');
    });

    it('Test 5 — competitor first', () => {
        const r = runExtraction({
            responseText: 'Otterly is great. MeasureX is also good.',
            brand: BRAND,
            competitors: [OTTERLY, PEEC],
        });
        expect(r.brandPosition).toBe(2);
        const otterly = r.competitorResults.find((c) => c.competitorId === 'c-otterly');
        expect(otterly?.position).toBe(1);
    });

    it('Test 6 — short name word boundary', () => {
        const r = runExtraction({
            responseText: 'The architecture of search engines is complex.',
            brand: { id: 'brand', name: 'Arc', domain: 'arc.dev' },
            competitors: [],
        });
        expect(r.brandMentioned).toBe(false);
    });

    it('Test 7 — domain in URL', () => {
        const r = runExtraction({
            responseText: 'Visit https://measurex.io for details.',
            brand: BRAND,
            competitors: [OTTERLY, PEEC],
        });
        expect(r.brandMentioned).toBe(true);
        expect(r.citations).toHaveLength(1);
        expect(r.citations[0].classification).toBe('owned');
        expect(r.citations[0].url).toBe('https://measurex.io');
    });

    it('Test 8 — multiple competitors, positions by character order', () => {
        const r = runExtraction({
            responseText: 'Otterly, Peec, and MeasureX all offer AEO tracking.',
            brand: BRAND,
            competitors: [OTTERLY, PEEC],
        });
        const otterly = r.competitorResults.find((c) => c.competitorId === 'c-otterly');
        const peec = r.competitorResults.find((c) => c.competitorId === 'c-peec');
        expect(otterly?.mentioned).toBe(true);
        expect(peec?.mentioned).toBe(true);
        expect(r.brandMentioned).toBe(true);
        expect(otterly?.position).toBe(1);
        expect(peec?.position).toBe(2);
        expect(r.brandPosition).toBe(3);
    });

    it('Test 9 — Perplexity native citations', () => {
        const r = runExtraction({
            responseText: 'Here are some sources comparing AEO tools.',
            nativeCitations: ['https://g2.com/categories/aeo', 'https://measurex.io/blog'],
            brand: BRAND,
            competitors: [OTTERLY, PEEC],
        });
        expect(r.citations).toHaveLength(2);
        const byClass = Object.fromEntries(r.citations.map((c) => [c.classification, c]));
        expect(byClass.review_site).toBeDefined();
        expect(byClass.owned).toBeDefined();
    });

    it('Test 10 — no URLs in ChatGPT response', () => {
        const r = runExtraction({
            responseText: 'MeasureX and Otterly are both solid choices for AEO.',
            brand: BRAND,
            competitors: [OTTERLY, PEEC],
        });
        expect(r.citations).toEqual([]);
    });
});
