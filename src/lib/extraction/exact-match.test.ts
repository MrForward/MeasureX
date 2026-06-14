/**
 * Unit tests for exact-match entity detection (PRD §F5a).
 */

import { describe, it, expect } from 'vitest';
import { exactMatch } from './exact-match';

describe('exactMatch', () => {
    it('matches the name case-insensitively', () => {
        const r = exactMatch('We use MEASUREX daily.', 'MeasureX', 'measurex.io');
        expect(r.mentioned).toBe(true);
        expect(r.mentionCount).toBe(1);
        expect(r.firstMentionPosition).toBe(7);
    });

    it('respects word boundaries (Arc ≠ architecture)', () => {
        const r = exactMatch('The architecture of search.', 'Arc', 'arc.dev');
        expect(r.mentioned).toBe(false);
        expect(r.firstMentionPosition).toBeNull();
    });

    it('requires domain-only match for names under 3 chars', () => {
        const nameOnly = exactMatch('Hi there, hi again', 'Hi', 'hi.com');
        expect(nameOnly.mentioned).toBe(false);

        const domainHit = exactMatch('See hi.com for more', 'Hi', 'hi.com');
        expect(domainHit.mentioned).toBe(true);
    });

    it('detects the domain literal', () => {
        const r = exactMatch('Visit https://measurex.io now', 'Nomatch', 'measurex.io');
        expect(r.mentioned).toBe(true);
    });

    it('counts multiple distinct occurrences', () => {
        const r = exactMatch('Otterly is good. Otterly wins.', 'Otterly', 'otterly.ai');
        expect(r.mentionCount).toBe(2);
        expect(r.firstMentionPosition).toBe(0);
    });

    it('returns absent for empty text', () => {
        const r = exactMatch('', 'MeasureX', 'measurex.io');
        expect(r).toEqual({ mentioned: false, mentionCount: 0, firstMentionPosition: null });
    });
});
