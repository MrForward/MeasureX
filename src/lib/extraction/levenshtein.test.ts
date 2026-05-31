/**
 * Unit tests for the typed Levenshtein wrapper.
 *
 * Validates: Requirement 5.2 (fuzzy matching to detect partial/variant mentions)
 */

import { describe, it, expect } from 'vitest';
import { editDistance, similarity } from './levenshtein';

describe('editDistance', () => {
    it('returns 0 for identical strings', () => {
        expect(editDistance('HubSpot', 'HubSpot')).toBe(0);
    });

    it('returns 0 for two empty strings', () => {
        expect(editDistance('', '')).toBe(0);
    });

    it('counts a single substitution as distance 1', () => {
        expect(editDistance('HubSpot', 'HubSpat')).toBe(1);
    });

    it('counts a single deletion as distance 1', () => {
        expect(editDistance('HubSpot', 'HubSot')).toBe(1);
    });

    it('counts a single insertion as distance 1', () => {
        expect(editDistance('HubSpot', 'HubSpoot')).toBe(1);
    });

    it('counts two edits as distance 2', () => {
        // two substitutions
        expect(editDistance('HubSpot', 'HabSpat')).toBe(2);
    });

    it('equals the length of the other string when one is empty', () => {
        expect(editDistance('', 'Zoho')).toBe(4);
        expect(editDistance('Zoho', '')).toBe(4);
    });

    it('is symmetric', () => {
        expect(editDistance('Salesforce', 'Saleforce')).toBe(editDistance('Saleforce', 'Salesforce'));
    });

    it('is case-sensitive (does not normalize casing itself)', () => {
        expect(editDistance('hubspot', 'HubSpot')).toBeGreaterThan(0);
    });
});

describe('similarity', () => {
    it('returns 1 for identical strings', () => {
        expect(similarity('HubSpot', 'HubSpot')).toBe(1);
    });

    it('returns 1 for two empty strings', () => {
        expect(similarity('', '')).toBe(1);
    });

    it('returns 0 when comparing against an empty string of equal max length', () => {
        // distance 4, maxLen 4 → 1 - 4/4 = 0
        expect(similarity('Zoho', '')).toBe(0);
    });

    it('produces a value in [0, 1]', () => {
        const s = similarity('Salesforce', 'Saleforce');
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
    });

    it('reflects a single edit relative to length', () => {
        // distance 1 over maxLen 7 → 1 - 1/7
        expect(similarity('HubSpot', 'HubSpat')).toBeCloseTo(1 - 1 / 7, 5);
    });

    it('is symmetric', () => {
        expect(similarity('Pipedrive', 'Pipedrve')).toBeCloseTo(similarity('Pipedrve', 'Pipedrive'), 10);
    });
});
