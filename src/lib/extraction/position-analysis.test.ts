/**
 * Unit tests for mention-position ranking (PRD §F5b).
 */

import { describe, it, expect } from 'vitest';
import { rankByPosition } from './position-analysis';

describe('rankByPosition', () => {
    it('ranks entities by ascending first-mention offset', () => {
        const ranks = rankByPosition([
            { id: 'brand', firstMentionPosition: 40 },
            { id: 'a', firstMentionPosition: 0 },
            { id: 'b', firstMentionPosition: 18 },
        ]);
        expect(ranks.get('a')).toBe(1);
        expect(ranks.get('b')).toBe(2);
        expect(ranks.get('brand')).toBe(3);
    });

    it('assigns null rank to absent entities', () => {
        const ranks = rankByPosition([
            { id: 'brand', firstMentionPosition: null },
            { id: 'a', firstMentionPosition: 5 },
        ]);
        expect(ranks.get('brand')).toBeNull();
        expect(ranks.get('a')).toBe(1);
    });

    it('breaks ties by input order', () => {
        const ranks = rankByPosition([
            { id: 'first', firstMentionPosition: 10 },
            { id: 'second', firstMentionPosition: 10 },
        ]);
        expect(ranks.get('first')).toBe(1);
        expect(ranks.get('second')).toBe(2);
    });
});
