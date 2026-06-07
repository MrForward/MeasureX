import { describe, it, expect } from 'vitest';
import { jaccardSimilarity, findSimilarPrompt } from './similarity';

describe('jaccardSimilarity', () => {
    it('returns 1 for identical text (ignoring case/punctuation)', () => {
        expect(jaccardSimilarity('Best CRM for startups?', 'best crm for startups')).toBe(1);
    });

    it('returns 0 for fully disjoint text', () => {
        expect(jaccardSimilarity('alpha beta', 'gamma delta')).toBe(0);
    });

    it('returns a partial score for overlapping text', () => {
        const s = jaccardSimilarity('best crm for startups', 'best crm for enterprises');
        expect(s).toBeGreaterThan(0);
        expect(s).toBeLessThan(1);
    });

    it('treats two empty strings as identical', () => {
        expect(jaccardSimilarity('', '')).toBe(1);
    });
});

describe('findSimilarPrompt', () => {
    const existing = [
        { id: 'p1', text: 'What is the best CRM for startups?' },
        { id: 'p2', text: 'How do I manage a remote team effectively?' },
    ];

    it('flags a near-duplicate above the threshold', () => {
        const match = findSimilarPrompt('what is the best crm for startups', existing, 0.8);
        expect(match?.id).toBe('p1');
        expect(match?.similarity).toBeGreaterThanOrEqual(0.8);
    });

    it('returns null when nothing is similar enough', () => {
        expect(findSimilarPrompt('pricing of cloud storage providers', existing, 0.8)).toBeNull();
    });

    it('returns the highest-scoring match when several exceed the threshold', () => {
        const pool = [
            { id: 'a', text: 'best crm for small business teams' },
            { id: 'b', text: 'best crm for small business' },
        ];
        const match = findSimilarPrompt('best crm for small business', pool, 0.5);
        expect(match?.id).toBe('b'); // exact-token match scores highest
    });
});
