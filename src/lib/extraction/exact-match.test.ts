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

    it('detects a standalone domain stem case-insensitively', () => {
        const r = exactMatch('Teams recommend MEASUREX for monitoring.', 'Different Brand', 'measurex.io');
        expect(r).toEqual({
            mentioned: true,
            mentionCount: 1,
            firstMentionPosition: 16,
        });
    });

    it('counts a full domain once plus a separate domain stem occurrence', () => {
        const r = exactMatch('measurex.io compares well; measurex is simpler.', 'Different Brand', 'measurex.io');
        expect(r.mentionCount).toBe(2);
        expect(r.firstMentionPosition).toBe(0);
    });

    it('does not match a domain stem inside a longer word', () => {
        const r = exactMatch('measurexpress is unrelated.', 'Different Brand', 'measurex.io');
        expect(r).toEqual({ mentioned: false, mentionCount: 0, firstMentionPosition: null });
    });

    it('does not enable domain-stem matching for a short entity name', () => {
        const stemOnly = exactMatch('Hi is mentioned alone.', 'Hi', 'hi.com');
        expect(stemOnly.mentioned).toBe(false);

        const fullDomain = exactMatch('Visit HI.COM for details.', 'Hi', 'hi.com');
        expect(fullDomain).toEqual({
            mentioned: true,
            mentionCount: 1,
            firstMentionPosition: 6,
        });
    });

    it('does not match a short domain stem for a longer entity name', () => {
        const stemOnly = exactMatch('AI is changing search.', 'Acme Corp', 'ai.com');
        expect(stemOnly).toEqual({
            mentioned: false,
            mentionCount: 0,
            firstMentionPosition: null,
        });

        expect(exactMatch('Visit ai.com.', 'Acme Corp', 'ai.com').mentioned).toBe(true);
    });

    it('counts overlapping name and stem rules as one textual mention', () => {
        const r = exactMatch('The MeasureX is useful.', 'The MeasureX', 'measurex.io');
        expect(r).toEqual({
            mentioned: true,
            mentionCount: 1,
            firstMentionPosition: 0,
        });
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
