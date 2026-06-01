import { describe, it, expect } from 'vitest';
import { initialsFromName, initialsFromUser } from './initials';

describe('initialsFromName', () => {
    it('returns "?" for empty/whitespace/null input', () => {
        expect(initialsFromName('')).toBe('?');
        expect(initialsFromName('   ')).toBe('?');
        expect(initialsFromName(null)).toBe('?');
        expect(initialsFromName(undefined)).toBe('?');
    });

    it('uses first letter of first two words for multi-word names', () => {
        expect(initialsFromName('Acme Corp')).toBe('AC');
        expect(initialsFromName('john doe')).toBe('JD');
        // Three words still uses first two
        expect(initialsFromName('Foo Bar Baz')).toBe('FB');
    });

    it('uses first two characters for single-word names', () => {
        expect(initialsFromName('Solo')).toBe('SO');
        expect(initialsFromName('hubspot')).toBe('HU');
    });

    it('uppercases a single character single-word name', () => {
        expect(initialsFromName('x')).toBe('X');
    });

    it('collapses extra whitespace between words', () => {
        expect(initialsFromName('  Acme   Corp  ')).toBe('AC');
    });
});

describe('initialsFromUser', () => {
    it('prefers the name when present', () => {
        expect(initialsFromUser('Jane Doe', 'jane@example.com')).toBe('JD');
    });

    it('falls back to email local-part when name is empty', () => {
        expect(initialsFromUser('', 'rachel@example.com')).toBe('RA');
        expect(initialsFromUser(null, 'rachel@example.com')).toBe('RA');
        expect(initialsFromUser(undefined, 'rachel@example.com')).toBe('RA');
    });

    it('returns "?" when neither name nor email yield initials', () => {
        expect(initialsFromUser(null, null)).toBe('?');
        expect(initialsFromUser('', '')).toBe('?');
        // Email with no local-part before @
        expect(initialsFromUser('', '@example.com')).toBe('?');
    });

    it('handles single-character email local-parts', () => {
        expect(initialsFromUser(null, 'a@example.com')).toBe('A');
    });
});
