/**
 * Unit tests for fuzzy-match entity extraction.
 *
 * Requirement 5.2: fuzzy matching to detect partial / variant mentions (typos).
 * Requirement 5.6 / Property 8: fuzzy matches assign confidence in [0.5, 0.9].
 * Requirement 17: avoid false positives via the 80% length rule and 4-char minimum.
 */

import { describe, it, expect } from 'vitest';
import { findFuzzyMatches } from './fuzzy-match';
import type { MatchableEntity } from './types';

const hubspot: MatchableEntity = {
    id: 'brand-1',
    type: 'brand',
    name: 'HubSpot',
    aliases: [],
    domain: 'hubspot.com',
};

const zohoCrm: MatchableEntity = {
    id: 'comp-2',
    type: 'competitor',
    name: 'Zoho CRM',
    aliases: [],
    domain: 'zoho.com',
};

describe('findFuzzyMatches', () => {
    it('matches a single-character typo (distance 1, confidence ~0.83)', () => {
        const matches = findFuzzyMatches('I really like HubSpat for marketing.', [hubspot]);
        expect(matches).toHaveLength(1);
        expect(matches[0].entityId).toBe('brand-1');
        expect(matches[0].matchType).toBe('fuzzy');
        expect(matches[0].matchedText).toBe('HubSpat');
        // 1 - 1 * 0.175 = 0.825
        expect(matches[0].confidence).toBeCloseTo(0.825, 5);
    });

    it('matches a two-character typo (distance 2, confidence ~0.65)', () => {
        // "HubSpatt" → "HubSpot": substitution + insertion = distance 2.
        const matches = findFuzzyMatches('Have you tried HubSpatt yet?', [hubspot]);
        expect(matches).toHaveLength(1);
        expect(matches[0].matchedText).toBe('HubSpatt');
        // 1 - 2 * 0.175 = 0.65
        expect(matches[0].confidence).toBeCloseTo(0.65, 5);
    });

    it('does NOT match when the edit distance is greater than 2', () => {
        // "Hubaspatz" → "HubSpot" is distance 3.
        const matches = findFuzzyMatches('What about Hubaspatz instead?', [hubspot]);
        expect(matches).toEqual([]);
    });

    it('does NOT fuzzy-match short entity names (< 4 chars)', () => {
        const shortEntity: MatchableEntity = {
            id: 'comp-short',
            type: 'competitor',
            name: 'Ada',
            aliases: [],
            domain: 'ada.com',
        };
        // "Ado" is distance 1 from "Ada" but the name is too short to fuzzy-match.
        const matches = findFuzzyMatches('We looked at Ado for support.', [shortEntity]);
        expect(matches).toEqual([]);
    });

    it('respects the 80% length rule (a short token does not match a long name)', () => {
        // "HubSp" → "HubSpot" is distance 2 (delete 'o','t'), but length 5 is
        // below 80% of 7 (= 5.6), so the 80% rule rejects it.
        const matches = findFuzzyMatches('It said HubSp somewhere.', [hubspot]);
        expect(matches).toEqual([]);
    });

    it('skips positions already covered by exact matches', () => {
        const text = 'I really like HubSpat for marketing.';
        const position = text.indexOf('HubSpat');
        const matches = findFuzzyMatches(text, [hubspot], [position]);
        expect(matches).toEqual([]);
    });

    it('matches a multi-word name with a typo ("Zooho CRM" → "Zoho CRM")', () => {
        const matches = findFuzzyMatches('We compared Zooho CRM against the rest.', [zohoCrm]);
        expect(matches).toHaveLength(1);
        expect(matches[0].entityId).toBe('comp-2');
        expect(matches[0].matchedText).toBe('Zooho CRM');
        expect(matches[0].matchType).toBe('fuzzy');
        expect(matches[0].confidence).toBeCloseTo(0.825, 5);
    });

    it('keeps every fuzzy confidence within the [0.5, 0.9] range', () => {
        const text = 'Both HubSpat and HubSpatt came up, plus Zooho CRM.';
        const matches = findFuzzyMatches(text, [hubspot, zohoCrm]);
        expect(matches.length).toBeGreaterThan(0);
        for (const match of matches) {
            expect(match.confidence).toBeGreaterThanOrEqual(0.5);
            expect(match.confidence).toBeLessThanOrEqual(0.9);
        }
    });

    it('returns an empty array when there are no near matches', () => {
        const matches = findFuzzyMatches('This sentence mentions nothing relevant.', [hubspot, zohoCrm]);
        expect(matches).toEqual([]);
    });

    it('does NOT return an exact (distance 0) occurrence as a fuzzy match', () => {
        const matches = findFuzzyMatches('HubSpot is the clear leader here.', [hubspot]);
        expect(matches).toEqual([]);
    });

    it('returns an empty array for empty text', () => {
        expect(findFuzzyMatches('', [hubspot])).toEqual([]);
    });

    it('returns an empty array when no entities are provided', () => {
        expect(findFuzzyMatches('HubSpat is here.', [])).toEqual([]);
    });

    it('records the correct character position of a fuzzy match', () => {
        const text = 'Use HubSpat.';
        const matches = findFuzzyMatches(text, [hubspot]);
        expect(matches).toHaveLength(1);
        expect(matches[0].position).toBe(text.indexOf('HubSpat'));
    });

    it('orders matches by their position in the text', () => {
        const text = 'First Zooho CRM, later HubSpat appears.';
        const matches = findFuzzyMatches(text, [hubspot, zohoCrm]);
        const positions = matches.map((m) => m.position);
        const sorted = [...positions].sort((a, b) => a - b);
        expect(positions).toEqual(sorted);
    });
});
