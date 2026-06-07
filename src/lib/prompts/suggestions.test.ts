import { describe, it, expect } from 'vitest';
import { suggestPrompts } from './suggestions';
import { PROMPT_INTENTS, PROMPT_MIN_LENGTH, PROMPT_MAX_LENGTH } from '@/lib/validations/prompt';

describe('suggestPrompts', () => {
    it('includes the brand name in every suggestion', () => {
        const suggestions = suggestPrompts('HubSpot');
        expect(suggestions.length).toBeGreaterThan(0);
        expect(suggestions.every((s) => s.text.includes('HubSpot'))).toBe(true);
    });

    it('spans all four intent categories (Req 16.5)', () => {
        const intents = new Set(suggestPrompts('HubSpot').map((s) => s.intent));
        for (const intent of PROMPT_INTENTS) {
            expect(intents.has(intent)).toBe(true);
        }
    });

    it('produces text within the prompt length limits', () => {
        for (const s of suggestPrompts('HubSpot')) {
            expect(s.text.length).toBeGreaterThanOrEqual(PROMPT_MIN_LENGTH);
            expect(s.text.length).toBeLessThanOrEqual(PROMPT_MAX_LENGTH);
        }
    });

    it('falls back gracefully for an empty brand name', () => {
        const suggestions = suggestPrompts('   ');
        expect(suggestions.every((s) => s.text.includes('your brand'))).toBe(true);
    });
});
