/**
 * Unit tests for context disambiguation of multi-entity matches.
 *
 * Requirement 17.2: when a mention matches multiple configured entities, use
 *   context analysis to assign the mention to the most likely entity and flag
 *   it for review.
 *
 * CRITICAL — token burn protection is verified explicitly: at most
 *   `extraction.max_llm_calls_per_response` (default 1) LLM calls are made per
 *   response; once the budget is spent, remaining ambiguous mentions are
 *   flagged for review WITHOUT another LLM call.
 *
 * All tests use a MOCK classifier — no real API calls, no network, no randomness.
 */

import { describe, it, expect, vi } from 'vitest';
import {
    findAmbiguousMentions,
    disambiguateMention,
    disambiguateMatches,
    parseDisambiguationResponse,
    buildDisambiguationPrompt,
    DEFAULT_MAX_LLM_CALLS,
    type AmbiguousMention,
} from './disambiguation';
import type { EntityMatch, MatchableEntity } from './types';
import type { LLMClassifier } from './recommendation-strength';

// ── Fixtures ─────────────────────────────────────────────────────────────

const ENTITIES: MatchableEntity[] = [
    { id: 'brand-1', type: 'brand', name: 'Salesforce', aliases: ['Force'], domain: 'salesforce.com' },
    { id: 'comp-1', type: 'competitor', name: 'Force', aliases: [], domain: 'force.com' },
    { id: 'comp-2', type: 'competitor', name: 'Monday', aliases: [], domain: 'monday.com' },
];

/** Build an EntityMatch with sensible defaults for these tests. */
function match(overrides: Partial<EntityMatch> & Pick<EntityMatch, 'entityId' | 'matchedText' | 'position'>): EntityMatch {
    return {
        entityType: 'competitor',
        matchType: 'exact',
        confidence: 1.0,
        ...overrides,
    };
}

/** Build a mock classifier returning a fixed reply, with a call spy. */
function mockClassifier(reply: string): LLMClassifier & { classify: ReturnType<typeof vi.fn> } {
    return { classify: vi.fn(async () => reply) };
}

/** Build a mock classifier that returns a different reply on each call. */
function sequenceClassifier(replies: string[]): LLMClassifier & { classify: ReturnType<typeof vi.fn> } {
    let i = 0;
    return {
        classify: vi.fn(async () => {
            const reply = replies[Math.min(i, replies.length - 1)];
            i += 1;
            return reply;
        }),
    };
}

// ── findAmbiguousMentions ──────────────────────────────────────────────────

describe('findAmbiguousMentions', () => {
    it('detects when 2 entities match the same text + position', () => {
        const matches: EntityMatch[] = [
            match({ entityId: 'brand-1', matchedText: 'Force', position: 10 }),
            match({ entityId: 'comp-1', matchedText: 'Force', position: 10 }),
        ];

        const ambiguous = findAmbiguousMentions(matches);

        expect(ambiguous).toHaveLength(1);
        expect(ambiguous[0].matchedText.toLowerCase()).toBe('force');
        expect(ambiguous[0].position).toBe(10);
        expect(ambiguous[0].candidateEntityIds.sort()).toEqual(['brand-1', 'comp-1']);
    });

    it('returns empty when there are no overlaps', () => {
        const matches: EntityMatch[] = [
            match({ entityId: 'brand-1', matchedText: 'Salesforce', position: 0 }),
            match({ entityId: 'comp-2', matchedText: 'Monday', position: 40 }),
        ];

        expect(findAmbiguousMentions(matches)).toEqual([]);
    });

    it('does not treat the same entity matched twice at one spot as ambiguous', () => {
        const matches: EntityMatch[] = [
            match({ entityId: 'comp-1', matchedText: 'Force', position: 5 }),
            match({ entityId: 'comp-1', matchedText: 'Force', position: 5 }),
        ];

        expect(findAmbiguousMentions(matches)).toEqual([]);
    });

    it('treats same text at different positions as separate (non-ambiguous) groups', () => {
        const matches: EntityMatch[] = [
            match({ entityId: 'brand-1', matchedText: 'Force', position: 10 }),
            match({ entityId: 'comp-1', matchedText: 'Force', position: 99 }),
        ];

        // Each position has only one entity → neither is ambiguous.
        expect(findAmbiguousMentions(matches)).toEqual([]);
    });

    it('returns multiple ambiguous mentions ordered by position', () => {
        const matches: EntityMatch[] = [
            match({ entityId: 'brand-1', matchedText: 'Force', position: 50 }),
            match({ entityId: 'comp-1', matchedText: 'Force', position: 50 }),
            match({ entityId: 'comp-2', matchedText: 'Monday', position: 5 }),
            match({ entityId: 'brand-1', matchedText: 'Monday', position: 5 }),
        ];

        const ambiguous = findAmbiguousMentions(matches);
        expect(ambiguous).toHaveLength(2);
        expect(ambiguous[0].position).toBe(5);
        expect(ambiguous[1].position).toBe(50);
    });
});

// ── parseDisambiguationResponse ─────────────────────────────────────────────

describe('parseDisambiguationResponse', () => {
    it('returns the candidate id named exactly by the reply', () => {
        expect(parseDisambiguationResponse('comp-1', ['brand-1', 'comp-1'])).toBe('comp-1');
        expect(parseDisambiguationResponse('  Brand-1 ', ['brand-1', 'comp-1'])).toBe('brand-1');
    });

    it('returns null for an "unknown" or empty reply', () => {
        expect(parseDisambiguationResponse('unknown', ['brand-1', 'comp-1'])).toBeNull();
        expect(parseDisambiguationResponse('   ', ['brand-1', 'comp-1'])).toBeNull();
    });

    it('returns null when the reply names a non-candidate id', () => {
        expect(parseDisambiguationResponse('comp-9', ['brand-1', 'comp-1'])).toBeNull();
    });

    it('returns null when the reply names more than one candidate', () => {
        expect(parseDisambiguationResponse('either brand-1 or comp-1', ['brand-1', 'comp-1'])).toBeNull();
    });
});

// ── buildDisambiguationPrompt ───────────────────────────────────────────────

describe('buildDisambiguationPrompt', () => {
    it('includes the mention, candidate ids/names, and surrounding context', () => {
        const text = 'We compared CRMs and the Force platform stood out for sales teams.';
        const mention: AmbiguousMention = {
            matchedText: 'Force',
            position: text.indexOf('Force'),
            candidateEntityIds: ['brand-1', 'comp-1'],
        };

        const prompt = buildDisambiguationPrompt(text, mention, ENTITIES.slice(0, 2));

        expect(prompt).toContain('Force');
        expect(prompt).toContain('brand-1');
        expect(prompt).toContain('comp-1');
        expect(prompt).toContain('Salesforce');
        expect(prompt.toLowerCase()).toContain('unknown');
    });
});

// ── disambiguateMention ─────────────────────────────────────────────────────

describe('disambiguateMention', () => {
    const text = 'We compared CRMs and the Force platform stood out for sales teams.';
    const mention: AmbiguousMention = {
        matchedText: 'Force',
        position: text.indexOf('Force'),
        candidateEntityIds: ['brand-1', 'comp-1'],
    };

    it('returns the LLM-chosen entity id', async () => {
        const classifier = mockClassifier('comp-1');
        const decision = await disambiguateMention(text, mention, ENTITIES, classifier);

        expect(decision.entityId).toBe('comp-1');
        expect(decision.flagForReview).toBe(false);
        expect(classifier.classify).toHaveBeenCalledTimes(1);
    });

    it('flags for review when the LLM response is invalid', async () => {
        const classifier = mockClassifier('I really cannot tell from this');
        const decision = await disambiguateMention(text, mention, ENTITIES, classifier);

        expect(decision.entityId).toBeNull();
        expect(decision.flagForReview).toBe(true);
    });

    it('flags for review when the LLM answers "unknown"', async () => {
        const classifier = mockClassifier('unknown');
        const decision = await disambiguateMention(text, mention, ENTITIES, classifier);

        expect(decision.entityId).toBeNull();
        expect(decision.flagForReview).toBe(true);
    });

    it('flags for review (never throws) when the classifier throws', async () => {
        const classifier: LLMClassifier = {
            classify: vi.fn(async () => {
                throw new Error('LLM unavailable');
            }),
        };

        const decision = await disambiguateMention(text, mention, ENTITIES, classifier);
        expect(decision.entityId).toBeNull();
        expect(decision.flagForReview).toBe(true);
    });
});

// ── disambiguateMatches ─────────────────────────────────────────────────────

describe('disambiguateMatches', () => {
    const text = 'Force is a great option, while Monday helps teams plan, and Force again.';

    /** Three ambiguous mentions at distinct positions. */
    function threeAmbiguousMatches(): EntityMatch[] {
        return [
            match({ entityId: 'brand-1', matchedText: 'Force', position: 0 }),
            match({ entityId: 'comp-1', matchedText: 'Force', position: 0 }),
            match({ entityId: 'comp-2', matchedText: 'Monday', position: 31 }),
            match({ entityId: 'brand-1', matchedText: 'Monday', position: 31 }),
            match({ entityId: 'brand-1', matchedText: 'Force', position: 60 }),
            match({ entityId: 'comp-1', matchedText: 'Force', position: 60 }),
        ];
    }

    it('respects the maxLlmCalls budget: 3 ambiguous mentions, budget 1 → 1 call, 2 flagged', async () => {
        const classifier = mockClassifier('comp-1');
        const result = await disambiguateMatches(text, threeAmbiguousMatches(), ENTITIES, classifier, 1);

        expect(classifier.classify).toHaveBeenCalledTimes(1);
        expect(result.llmCallsMade).toBe(1);
        expect(result.flaggedForReview).toHaveLength(2);
    });

    it('returns the correct llmCallsMade count when the budget allows all', async () => {
        const classifier = sequenceClassifier(['comp-1', 'comp-2', 'brand-1']);
        const result = await disambiguateMatches(text, threeAmbiguousMatches(), ENTITIES, classifier, 5);

        // Three ambiguous mentions, budget of 5 → three calls made.
        expect(result.llmCallsMade).toBe(3);
        expect(classifier.classify).toHaveBeenCalledTimes(3);
        expect(result.flaggedForReview).toHaveLength(0);
    });

    it('flags remaining mentions for review once the budget is exhausted', async () => {
        // Give each in-budget call a VALID candidate id so it resolves:
        //   mention @0  (Force)  → comp-1 (candidate)
        //   mention @31 (Monday) → comp-2 (candidate)
        // The third mention is never reached because the budget (2) is spent.
        const classifier = sequenceClassifier(['comp-1', 'comp-2']);
        const result = await disambiguateMatches(text, threeAmbiguousMatches(), ENTITIES, classifier, 2);

        expect(result.llmCallsMade).toBe(2);
        // 3 ambiguous - 2 resolved attempts = 1 flagged without an LLM call.
        expect(result.flaggedForReview).toHaveLength(1);
    });

    it('resolves a mention by keeping only the chosen entity at that span', async () => {
        const matches: EntityMatch[] = [
            match({ entityId: 'brand-1', matchedText: 'Force', position: 0 }),
            match({ entityId: 'comp-1', matchedText: 'Force', position: 0 }),
        ];
        const classifier = mockClassifier('comp-1');

        const result = await disambiguateMatches(text, matches, ENTITIES, classifier, 1);

        const atSpan = result.resolved.filter((m) => m.position === 0);
        expect(atSpan).toHaveLength(1);
        expect(atSpan[0].entityId).toBe('comp-1');
        expect(result.flaggedForReview).toHaveLength(0);
    });

    it('leaves non-ambiguous matches untouched', async () => {
        const matches: EntityMatch[] = [
            match({ entityId: 'brand-1', matchedText: 'Salesforce', position: 0, entityType: 'brand' }),
            match({ entityId: 'comp-2', matchedText: 'Monday', position: 40 }),
        ];
        const classifier = mockClassifier('comp-1');

        const result = await disambiguateMatches(text, matches, ENTITIES, classifier, 1);

        expect(result.resolved).toHaveLength(2);
        expect(result.llmCallsMade).toBe(0);
        expect(classifier.classify).not.toHaveBeenCalled();
    });

    it('flags for review (never throws) when the LLM errors', async () => {
        const matches: EntityMatch[] = [
            match({ entityId: 'brand-1', matchedText: 'Force', position: 0 }),
            match({ entityId: 'comp-1', matchedText: 'Force', position: 0 }),
        ];
        const classifier: LLMClassifier = {
            classify: vi.fn(async () => {
                throw new Error('boom');
            }),
        };

        const result = await disambiguateMatches(text, matches, ENTITIES, classifier, 1);

        // The error counted as one spent call, and the mention is flagged.
        expect(result.llmCallsMade).toBe(1);
        expect(result.flaggedForReview).toHaveLength(1);
        // Both candidate matches remain at the span (nothing resolved).
        expect(result.resolved.filter((m) => m.position === 0)).toHaveLength(2);
    });

    it('makes at most ONE call with the default budget (token burn protection)', async () => {
        // Sanity: the config default loop guard is 1.
        expect(DEFAULT_MAX_LLM_CALLS).toBe(1);

        const classifier = mockClassifier('comp-1');
        const result = await disambiguateMatches(text, threeAmbiguousMatches(), ENTITIES, classifier);

        expect(classifier.classify).toHaveBeenCalledTimes(1);
        expect(result.llmCallsMade).toBe(1);
        expect(result.flaggedForReview).toHaveLength(2);
    });

    it('makes zero calls when there is nothing ambiguous', async () => {
        const matches: EntityMatch[] = [
            match({ entityId: 'comp-2', matchedText: 'Monday', position: 31 }),
        ];
        const classifier = mockClassifier('comp-2');

        const result = await disambiguateMatches(text, matches, ENTITIES, classifier, 1);

        expect(result.llmCallsMade).toBe(0);
        expect(classifier.classify).not.toHaveBeenCalled();
        expect(result.flaggedForReview).toEqual([]);
        expect(result.resolved).toEqual(matches);
    });
});
