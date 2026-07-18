import { describe, it, expect } from 'vitest';
import { CreatePromptSchema, UpdatePromptSchema } from './prompt';

describe('CreatePromptSchema', () => {
    const valid = {
        text: 'What is the best CRM for startups?',
        intent: 'commercial',
        engines: ['chatgpt', 'perplexity'],
    };

    it('accepts a valid prompt and applies geography/language defaults', () => {
        const r = CreatePromptSchema.parse(valid);
        expect(r.geography).toBe('US');
        expect(r.language).toBe('en');
        expect(r.engines).toEqual(['chatgpt', 'perplexity']);
    });

    it('rejects text shorter than 10 chars (Req 16.1)', () => {
        expect(CreatePromptSchema.safeParse({ ...valid, text: 'too short' }).success).toBe(false);
    });

    it('rejects text longer than 500 chars (Req 16.1)', () => {
        expect(CreatePromptSchema.safeParse({ ...valid, text: 'a'.repeat(501) }).success).toBe(false);
    });

    it('rejects an unknown intent (Req 16.4)', () => {
        expect(CreatePromptSchema.safeParse({ ...valid, intent: 'spam' }).success).toBe(false);
    });

    it('requires at least one engine (Req 3.7)', () => {
        expect(CreatePromptSchema.safeParse({ ...valid, engines: [] }).success).toBe(false);
    });

    it('rejects an unknown engine', () => {
        expect(CreatePromptSchema.safeParse({ ...valid, engines: ['bing'] }).success).toBe(false);
    });

    it('rejects Google AI because the MVP supports exactly two engines', () => {
        expect(CreatePromptSchema.safeParse({ ...valid, engines: ['google_ai'] }).success).toBe(false);
    });

    it('rejects Google AI when mixed with a supported engine', () => {
        expect(CreatePromptSchema.safeParse({ ...valid, engines: ['chatgpt', 'google_ai'] }).success).toBe(false);
    });

    it('de-duplicates engines', () => {
        const r = CreatePromptSchema.parse({ ...valid, engines: ['chatgpt', 'chatgpt', 'perplexity'] });
        expect(r.engines).toEqual(['chatgpt', 'perplexity']);
    });
});

describe('UpdatePromptSchema', () => {
    it('rejects an empty update object', () => {
        expect(UpdatePromptSchema.safeParse({}).success).toBe(false);
    });

    it('accepts a single-field update', () => {
        expect(UpdatePromptSchema.safeParse({ status: 'archived' }).success).toBe(true);
    });

    it('rejects an invalid status', () => {
        expect(UpdatePromptSchema.safeParse({ status: 'deleted' }).success).toBe(false);
    });

    it('rejects Google AI engine updates', () => {
        expect(UpdatePromptSchema.safeParse({ engines: ['google_ai'] }).success).toBe(false);
    });
});
