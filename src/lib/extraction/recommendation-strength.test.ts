/**
 * Unit tests for recommendation-strength language detection.
 *
 * Requirement 5.8: detect recommendation-strength language (e.g. "recommended",
 *   "best option", "top choice") associated with brand mentions.
 * Requirement 6.1: recommendation factor — explicit = 100%, neutral = 50%, none = 0%.
 *
 * Token burn protection is verified explicitly: the LLM path is only reached
 * when the rules are inconclusive, and at most ONE classifier call is ever made.
 * All tests use a MOCK classifier — no real API calls, no network, no randomness.
 */

import { describe, it, expect, vi } from 'vitest';
import {
    detectStrengthRuleBased,
    detectStrengthWithLLM,
    detectRecommendationStrength,
    parseStrengthResponse,
    buildClassificationPrompt,
    type LLMClassifier,
} from './recommendation-strength';
import type { RecommendationStrength } from '@/types';

/** Locate the brand mention's start index within a text (test helper). */
function positionOf(text: string, mention: string): number {
    return text.indexOf(mention);
}

/** Build a mock classifier that always returns a fixed reply, with a spy. */
function mockClassifier(reply: string): LLMClassifier & { classify: ReturnType<typeof vi.fn> } {
    return { classify: vi.fn(async () => reply) };
}

describe('detectStrengthRuleBased', () => {
    it("detects 'I highly recommend HubSpot' as explicit", () => {
        const text = 'I highly recommend HubSpot for growing teams.';
        const result = detectStrengthRuleBased(text, positionOf(text, 'HubSpot'), 'HubSpot'.length);
        expect(result.strength).toBe('explicit');
        expect(result.conclusive).toBe(true);
    });

    it("detects 'HubSpot is the best CRM' as explicit", () => {
        const text = 'HubSpot is the best CRM for inbound marketing.';
        const result = detectStrengthRuleBased(text, positionOf(text, 'HubSpot'), 'HubSpot'.length);
        expect(result.strength).toBe('explicit');
        expect(result.conclusive).toBe(true);
    });

    it('detects a neutral listing as neutral and inconclusive', () => {
        const text = 'Options include HubSpot, Salesforce, and Zoho.';
        const result = detectStrengthRuleBased(text, positionOf(text, 'HubSpot'), 'HubSpot'.length);
        expect(result.strength).toBe('neutral');
        // No strong keyword signal → rules are inconclusive (LLM could help).
        expect(result.conclusive).toBe(false);
    });

    it("treats a negative mention 'Avoid HubSpot' as neutral (not a recommendation)", () => {
        const text = 'Avoid HubSpot if you need a free tier.';
        const result = detectStrengthRuleBased(text, positionOf(text, 'HubSpot'), 'HubSpot'.length);
        // Negative framing is a conclusive signal, but it is NOT a recommendation.
        expect(result.strength).toBe('neutral');
        expect(result.conclusive).toBe(true);
    });

    it("does not mistake 'not recommended' for an explicit recommendation", () => {
        const text = 'HubSpot is not recommended for tiny startups.';
        const result = detectStrengthRuleBased(text, positionOf(text, 'HubSpot'), 'HubSpot'.length);
        expect(result.strength).toBe('neutral');
        expect(result.conclusive).toBe(true);
    });

    it('sets conclusive=true for clear signals and false for ambiguous ones', () => {
        const explicitText = 'Our top pick is HubSpot.';
        const ambiguousText = 'You might consider HubSpot at some point.';

        const explicit = detectStrengthRuleBased(
            explicitText,
            positionOf(explicitText, 'HubSpot'),
            'HubSpot'.length,
        );
        const ambiguous = detectStrengthRuleBased(
            ambiguousText,
            positionOf(ambiguousText, 'HubSpot'),
            'HubSpot'.length,
        );

        expect(explicit.conclusive).toBe(true);
        expect(ambiguous.conclusive).toBe(false);
    });

    it('only considers keywords within the context window', () => {
        // "best" is far (>100 chars) before the mention → outside the window.
        const filler = ' lorem'.repeat(40); // ~240 chars
        const text = `This is the best laptop.${filler} Separately, HubSpot exists.`;
        const result = detectStrengthRuleBased(text, positionOf(text, 'HubSpot'), 'HubSpot'.length);
        expect(result.strength).toBe('neutral');
        expect(result.conclusive).toBe(false);
    });
});

describe('parseStrengthResponse', () => {
    it.each<[string, RecommendationStrength]>([
        ['explicit', 'explicit'],
        ['neutral', 'neutral'],
        ['none', 'none'],
        ['  Explicit  ', 'explicit'],
        ['NONE', 'none'],
    ])('parses %j into %j', (raw, expected) => {
        expect(parseStrengthResponse(raw)).toBe(expected);
    });

    it("defaults invalid output to 'neutral'", () => {
        expect(parseStrengthResponse('maybe')).toBe('neutral');
        expect(parseStrengthResponse('')).toBe('neutral');
        expect(parseStrengthResponse('explicit recommendation, definitely')).toBe('neutral');
    });
});

describe('buildClassificationPrompt', () => {
    it('includes the mention text and the response text', () => {
        const prompt = buildClassificationPrompt('HubSpot is fine.', 'HubSpot');
        expect(prompt).toContain('HubSpot');
        expect(prompt).toContain('HubSpot is fine.');
        // Constrains the model to a single-word answer.
        expect(prompt.toLowerCase()).toContain('explicit, neutral, or none');
    });
});

describe('detectStrengthWithLLM', () => {
    it("returns 'explicit' when the classifier replies 'explicit'", async () => {
        const classifier = mockClassifier('explicit');
        const result = await detectStrengthWithLLM('Some text', 'HubSpot', classifier);
        expect(result).toBe('explicit');
        expect(classifier.classify).toHaveBeenCalledTimes(1);
    });

    it("validates the reply and defaults invalid output to 'neutral'", async () => {
        const classifier = mockClassifier('I think it is pretty good honestly');
        const result = await detectStrengthWithLLM('Some text', 'HubSpot', classifier);
        expect(result).toBe('neutral');
    });

    it("returns the safe default 'neutral' when the classifier throws", async () => {
        const classifier: LLMClassifier = {
            classify: vi.fn(async () => {
                throw new Error('LLM unavailable');
            }),
        };
        const result = await detectStrengthWithLLM('Some text', 'HubSpot', classifier);
        expect(result).toBe('neutral');
    });
});

describe('detectRecommendationStrength', () => {
    it('returns the rule-based result when no classifier is provided', async () => {
        const text = 'I highly recommend HubSpot.';
        const result = await detectRecommendationStrength(
            text,
            positionOf(text, 'HubSpot'),
            'HubSpot'.length,
        );
        expect(result).toBe('explicit');
    });

    it('does NOT call the LLM when the rules are conclusive (token burn protection)', async () => {
        const text = 'HubSpot is the best CRM.';
        const classifier = mockClassifier('none');
        const result = await detectRecommendationStrength(
            text,
            positionOf(text, 'HubSpot'),
            'HubSpot'.length,
            classifier,
        );
        // Rule path already conclusive → 'explicit', and the LLM was never touched.
        expect(result).toBe('explicit');
        expect(classifier.classify).not.toHaveBeenCalled();
    });

    it('calls the LLM only when the rules are inconclusive', async () => {
        const text = 'Options include HubSpot and others.';
        const classifier = mockClassifier('explicit');
        const result = await detectRecommendationStrength(
            text,
            positionOf(text, 'HubSpot'),
            'HubSpot'.length,
            classifier,
        );
        expect(result).toBe('explicit');
        expect(classifier.classify).toHaveBeenCalledTimes(1);
    });

    it('makes at most ONE LLM call for an inconclusive case (token burn protection)', async () => {
        const text = 'You could look at HubSpot among other tools.';
        const classifier = mockClassifier('neutral');
        await detectRecommendationStrength(
            text,
            positionOf(text, 'HubSpot'),
            'HubSpot'.length,
            classifier,
        );
        expect(classifier.classify).toHaveBeenCalledTimes(1);
    });

    it("defaults to 'neutral' when an inconclusive case gets invalid LLM output", async () => {
        const text = 'You could look at HubSpot among other tools.';
        const classifier = mockClassifier('not sure really');
        const result = await detectRecommendationStrength(
            text,
            positionOf(text, 'HubSpot'),
            'HubSpot'.length,
            classifier,
        );
        expect(result).toBe('neutral');
        expect(classifier.classify).toHaveBeenCalledTimes(1);
    });
});
