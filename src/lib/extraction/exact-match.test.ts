/**
 * Unit tests for exact-match entity extraction.
 *
 * Requirement 5.1: identify exact matches of brand name, aliases, competitor names
 * Requirement 5.6 / Property 8: exact matches assign Confidence_Score of 1.0
 * Requirement 17: avoid false positives (word boundaries); longest-match-first
 */

import { describe, it, expect } from 'vitest';
import { findExactMatches } from './exact-match';
import type { MatchableEntity } from './types';

const hubspot: MatchableEntity = {
    id: 'brand-1',
    type: 'brand',
    name: 'HubSpot',
    aliases: ['Hubspot', 'hubspot'],
    domain: 'hubspot.com',
};

const salesforce: MatchableEntity = {
    id: 'comp-1',
    type: 'competitor',
    name: 'Salesforce',
    aliases: [],
    domain: 'salesforce.com',
};

const zohoCrm: MatchableEntity = {
    id: 'comp-2',
    type: 'competitor',
    name: 'Zoho CRM',
    aliases: ['Zoho'],
    domain: 'zoho.com',
};

const mondayCom: MatchableEntity = {
    id: 'comp-3',
    type: 'competitor',
    name: 'Monday.com',
    aliases: [],
    domain: 'monday.com',
};

describe('findExactMatches', () => {
    it('finds an exact brand name match (case-insensitive)', () => {
        const matches = findExactMatches('I recommend HUBSPOT for marketing.', [hubspot]);
        expect(matches).toHaveLength(1);
        expect(matches[0].entityId).toBe('brand-1');
        expect(matches[0].entityType).toBe('brand');
        expect(matches[0].matchedText).toBe('HUBSPOT');
        expect(matches[0].matchType).toBe('exact');
    });

    it('matches regardless of the configured name casing', () => {
        const lower = findExactMatches('try hubspot today', [hubspot]);
        const mixed = findExactMatches('Try HubSpot today', [hubspot]);
        expect(lower).toHaveLength(1);
        expect(mixed).toHaveLength(1);
    });

    it('finds alias matches', () => {
        const entity: MatchableEntity = {
            id: 'comp-x',
            type: 'competitor',
            name: 'ActiveCampaign',
            aliases: ['Active Campaign', 'AC'],
            domain: 'activecampaign.com',
        };
        const matches = findExactMatches('We migrated from Active Campaign last year.', [entity]);
        expect(matches).toHaveLength(1);
        expect(matches[0].matchedText).toBe('Active Campaign');
        expect(matches[0].entityId).toBe('comp-x');
    });

    it('does NOT match a substring inside a larger word ("Force" in "Salesforce")', () => {
        const force: MatchableEntity = {
            id: 'comp-force',
            type: 'competitor',
            name: 'Force',
            aliases: [],
            domain: 'force.com',
        };
        const matches = findExactMatches('Salesforce is a CRM platform.', [force]);
        expect(matches).toHaveLength(0);
    });

    it('does NOT match "hub" inside "GitHub"', () => {
        const hub: MatchableEntity = {
            id: 'comp-hub',
            type: 'competitor',
            name: 'hub',
            aliases: [],
            domain: 'hub.com',
        };
        const matches = findExactMatches('We host our code on GitHub these days.', [hub]);
        expect(matches).toHaveLength(0);
    });

    it('matches multi-word names ("Zoho CRM")', () => {
        const matches = findExactMatches('Zoho CRM competes with HubSpot.', [zohoCrm]);
        const crmMatch = matches.find((m) => m.matchedText === 'Zoho CRM');
        expect(crmMatch).toBeDefined();
        expect(crmMatch?.entityId).toBe('comp-2');
    });

    it('handles special regex characters — the dot in "Monday.com" is literal', () => {
        const matches = findExactMatches('Monday.com is a work OS.', [mondayCom]);
        expect(matches).toHaveLength(1);
        expect(matches[0].matchedText).toBe('Monday.com');
    });

    it('does NOT treat the dot in "Monday.com" as a wildcard', () => {
        // "MondayXcom" must not match because the dot is escaped to a literal.
        const matches = findExactMatches('MondayXcom is not a real product.', [mondayCom]);
        expect(matches).toHaveLength(0);
    });

    it('returns multiple matches when a name appears multiple times', () => {
        const text = 'HubSpot is great. Many teams pick HubSpot, and hubspot keeps improving.';
        const matches = findExactMatches(text, [hubspot]);
        expect(matches).toHaveLength(3);
        expect(matches.every((m) => m.entityId === 'brand-1')).toBe(true);
    });

    it('returns an empty array when there are no matches', () => {
        const matches = findExactMatches('This text mentions no configured entities.', [hubspot, salesforce]);
        expect(matches).toEqual([]);
    });

    it('assigns confidence 1.0 to every exact match', () => {
        const text = 'HubSpot and Salesforce and Monday.com are all here.';
        const matches = findExactMatches(text, [hubspot, salesforce, mondayCom]);
        expect(matches.length).toBeGreaterThan(0);
        expect(matches.every((m) => m.confidence === 1)).toBe(true);
        expect(matches.every((m) => m.matchType === 'exact')).toBe(true);
    });

    it('records the correct character position of each match', () => {
        const text = 'Use HubSpot.';
        const matches = findExactMatches(text, [hubspot]);
        expect(matches).toHaveLength(1);
        expect(matches[0].position).toBe(text.indexOf('HubSpot'));
        expect(text.slice(matches[0].position, matches[0].position + matches[0].matchedText.length)).toBe(
            'HubSpot',
        );
    });

    it('prefers the longest match when entity names overlap at the same position', () => {
        const text = 'We evaluated Zoho CRM for our team.';
        const matches = findExactMatches(text, [zohoCrm]);
        // "Zoho" (alias) and "Zoho CRM" (name) both start at the same index;
        // only the longer "Zoho CRM" should be kept.
        expect(matches).toHaveLength(1);
        expect(matches[0].matchedText).toBe('Zoho CRM');
    });

    it('still matches a standalone shorter alias when the longer name is absent', () => {
        const text = 'Zoho is popular in India.';
        const matches = findExactMatches(text, [zohoCrm]);
        expect(matches).toHaveLength(1);
        expect(matches[0].matchedText).toBe('Zoho');
    });

    it('handles empty text', () => {
        expect(findExactMatches('', [hubspot, salesforce])).toEqual([]);
    });

    it('handles an empty entities list', () => {
        expect(findExactMatches('HubSpot is mentioned here.', [])).toEqual([]);
    });

    it('finds matches for multiple distinct entities in one pass', () => {
        const text = 'Compared to Salesforce, HubSpot has a friendlier UI.';
        const matches = findExactMatches(text, [hubspot, salesforce]);
        const ids = matches.map((m) => m.entityId).sort();
        expect(ids).toEqual(['brand-1', 'comp-1']);
    });

    it('returns matches ordered by their position in the text', () => {
        const text = 'Salesforce first, then HubSpot, then Salesforce again.';
        const matches = findExactMatches(text, [hubspot, salesforce]);
        const positions = matches.map((m) => m.position);
        const sorted = [...positions].sort((a, b) => a - b);
        expect(positions).toEqual(sorted);
    });

    it('ignores blank/whitespace-only aliases', () => {
        const entity: MatchableEntity = {
            id: 'comp-blank',
            type: 'competitor',
            name: 'Pipedrive',
            aliases: ['', '   '],
            domain: 'pipedrive.com',
        };
        const matches = findExactMatches('Pipedrive is lightweight.', [entity]);
        expect(matches).toHaveLength(1);
        expect(matches[0].matchedText).toBe('Pipedrive');
    });
});
