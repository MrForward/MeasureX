/**
 * Zod request schemas + helpers for the §6 API routes.
 *
 * Domain inputs are normalized with the SAME `normalizeDomain` used by the
 * extraction pipeline, so a stored brand/competitor domain matches the domain a
 * citation URL normalizes to (PRD §F3 "strip protocol and trailing slash").
 */

import { z } from 'zod';
import { normalizeDomain } from '@/lib/extraction/url-extract';

/** PRD §F3 prompt categories. */
export const PROMPT_CATEGORIES = ['category', 'comparison', 'buyer_intent'] as const;
export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

/** A domain string that normalizes to a non-empty `host.tld`. */
const domainField = z
    .string()
    .trim()
    .min(1, 'Domain is required')
    .max(255)
    .transform((value) => normalizeDomain(value))
    .refine((d) => d.length > 0 && d.includes('.'), {
        message: 'Enter a valid domain, e.g. example.com',
    });

const nameField = z.string().trim().min(1).max(100);

export const brandInputSchema = z.object({
    name: nameField,
    domain: domainField,
});

export const competitorInputSchema = z.object({
    name: nameField,
    domain: domainField,
});

export const promptInputSchema = z.object({
    text: z.string().trim().min(1).max(500),
    category: z.enum(PROMPT_CATEGORIES),
});

/** POST /api/brand/onboard — brand + 1-2 competitors + 10-20 prompts in one call. */
export const onboardSchema = z.object({
    brand: brandInputSchema,
    competitors: z.array(competitorInputSchema).min(1).max(2),
    prompts: z.array(promptInputSchema).min(10).max(20),
});

/** PUT /api/brand — update name and/or domain. */
export const brandUpdateSchema = z
    .object({
        name: nameField.optional(),
        domain: domainField.optional(),
    })
    .refine((d) => d.name !== undefined || d.domain !== undefined, {
        message: 'Provide at least one field to update',
    });

/** POST /api/prompts — add a single prompt. */
export const promptCreateSchema = promptInputSchema;

/** PUT /api/prompts/[id] — edit text/category/active. */
export const promptUpdateSchema = z
    .object({
        text: z.string().trim().min(1).max(500).optional(),
        category: z.enum(PROMPT_CATEGORIES).optional(),
        active: z.boolean().optional(),
    })
    .refine((d) => d.text !== undefined || d.category !== undefined || d.active !== undefined, {
        message: 'Provide at least one field to update',
    });

/** POST /api/prompts/generate — inputs for Claude prompt generation (PRD §F3). */
export const generateInputSchema = z.object({
    brandName: nameField,
    domain: domainField,
    competitor1: nameField,
    competitor2: nameField.optional(),
});

export type OnboardInput = z.infer<typeof onboardSchema>;
export type GenerateInput = z.infer<typeof generateInputSchema>;
