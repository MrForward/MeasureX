import { describe, it, expect } from 'vitest';
import { generateRecommendations, type RecommendationInput } from './generate';

function input(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
    return {
        brandName: 'HubSpot',
        brandShareOfVoice: 50,
        prompts: [],
        ...overrides,
    };
}

describe('generateRecommendations', () => {
    it('flags an absent brand on a prompt as high impact', () => {
        const recs = generateRecommendations(
            input({
                prompts: [{ promptId: 'p1', text: 'best CRM', visibilityScore: 0, mentionCount: 0, citationRate: 0 }],
            }),
        );
        expect(recs).toHaveLength(1);
        expect(recs[0].impactLevel).toBe('high');
        expect(recs[0].promptId).toBe('p1');
        expect(recs[0].evidenceText).toContain('did not appear');
    });

    it('flags mentioned-but-not-cited as medium impact', () => {
        const recs = generateRecommendations(
            input({
                prompts: [{ promptId: 'p1', text: 'best CRM', visibilityScore: 60, mentionCount: 2, citationRate: 0 }],
            }),
        );
        expect(recs[0].impactLevel).toBe('medium');
        expect(recs[0].action).toContain('cite');
    });

    it('does not recommend anything for a strong prompt', () => {
        const recs = generateRecommendations(
            input({
                prompts: [{ promptId: 'p1', text: 'best CRM', visibilityScore: 85, mentionCount: 3, citationRate: 100 }],
            }),
        );
        expect(recs).toHaveLength(0);
    });

    it('adds a workspace-level recommendation when share of voice is low', () => {
        const recs = generateRecommendations(input({ brandShareOfVoice: 15 }));
        expect(recs).toHaveLength(1);
        expect(recs[0].promptId).toBeNull();
        expect(recs[0].impactLevel).toBe('high');
        expect(recs[0].evidenceText).toContain('15%');
    });

    it('sorts by impact (high → medium → low) then caps the count', () => {
        const prompts = Array.from({ length: 10 }, (_, i) => ({
            promptId: `p${i}`,
            text: `prompt ${i}`,
            visibilityScore: i < 5 ? 0 : 60, // 5 high (absent), 5 medium (not cited)
            mentionCount: i < 5 ? 0 : 2,
            citationRate: 0,
        }));
        const recs = generateRecommendations(input({ prompts }));
        expect(recs.length).toBeLessThanOrEqual(6);
        // Highest-impact first.
        expect(recs[0].impactLevel).toBe('high');
        const ranks = recs.map((r) => ({ high: 3, medium: 2, low: 1 }[r.impactLevel]));
        expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
    });
});
