/**
 * Unit tests for response highlighting (PRD §F8).
 */

import { describe, it, expect } from 'vitest';
import { segmentResponse } from './highlight';

const BRAND = ['MeasureX', 'measurex.io'];
const COMPETITORS = ['Otterly', 'otterly.ai', 'Peec', 'peec.ai'];

/** Concatenate the segments of a given kind, for terse assertions. */
function textOf(segments: { text: string; kind: string }[], kind: string): string[] {
    return segments.filter((s) => s.kind === kind).map((s) => s.text);
}

describe('segmentResponse', () => {
    it('returns [] for empty text', () => {
        expect(segmentResponse('', BRAND, COMPETITORS)).toEqual([]);
    });

    it('highlights brand and competitor names and leaves plain text between', () => {
        const segs = segmentResponse('MeasureX beats Otterly easily.', BRAND, COMPETITORS);
        expect(textOf(segs, 'brand')).toEqual(['MeasureX']);
        expect(textOf(segs, 'competitor')).toEqual(['Otterly']);
        expect(segs.map((s) => s.text).join('')).toBe('MeasureX beats Otterly easily.');
    });

    it('is case-insensitive', () => {
        const segs = segmentResponse('measurex and OTTERLY', BRAND, COMPETITORS);
        expect(textOf(segs, 'brand')).toEqual(['measurex']);
        expect(textOf(segs, 'competitor')).toEqual(['OTTERLY']);
    });

    it('respects word boundaries for names (Arc ≠ architecture)', () => {
        const segs = segmentResponse('The architecture is solid.', ['Arc', 'arc.dev'], []);
        expect(textOf(segs, 'brand')).toEqual([]);
    });

    it('highlights URLs and does not double-highlight a domain inside the URL', () => {
        const segs = segmentResponse('Visit https://measurex.io/blog for more.', BRAND, COMPETITORS);
        expect(textOf(segs, 'url')).toEqual(['https://measurex.io/blog']);
        // measurex.io is part of the URL, not a separate brand highlight
        expect(textOf(segs, 'brand')).toEqual([]);
    });

    it('strips trailing punctuation from a URL match', () => {
        const segs = segmentResponse('See https://g2.com.', BRAND, COMPETITORS);
        expect(textOf(segs, 'url')).toEqual(['https://g2.com']);
        expect(segs.map((s) => s.text).join('')).toBe('See https://g2.com.');
    });

    it('reconstructs the original text exactly', () => {
        const input = 'MeasureX (measurex.io) vs Peec — see https://peec.ai/x now.';
        const segs = segmentResponse(input, BRAND, COMPETITORS);
        expect(segs.map((s) => s.text).join('')).toBe(input);
    });
});
