import { z } from 'zod';

/**
 * Normalizes a domain/URL string:
 * - Strips protocol (http:// or https://)
 * - Strips trailing slashes
 * - Lowercases the result
 *
 * Mirrors the same normalization used in brand.ts.
 */
function normalizeDomain(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//i, '')
        .replace(/\/+$/, '');
}

/**
 * Validates that a string is a well-formed domain or URL.
 * Accepts plain domains ("hubspot.com") and full URLs ("https://hubspot.com").
 *
 * Requirement 2.2: competitor domain validation
 */
const competitorDomainSchema = z
    .string()
    .min(1, 'Domain is required')
    .transform((val) => normalizeDomain(val))
    .refine(
        (val) => {
            const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;
            return domainRegex.test(val);
        },
        { message: 'Domain must be a valid domain (e.g. "hubspot.com") or URL (e.g. "https://hubspot.com")' },
    );

/**
 * Validation schema for creating a competitor.
 *
 * Requirement 2.2: up to 5 competitors, each with name and domain
 * Requirement 17.1: disambiguation aliases
 */
export const CreateCompetitorSchema = z.object({
    name: z
        .string()
        .min(1, 'Competitor name is required')
        .max(100, 'Competitor name must be 100 characters or fewer')
        .trim(),

    domain: competitorDomainSchema,

    aliases: z
        .array(
            z
                .string()
                .min(1, 'Alias must not be empty')
                .max(50, 'Each alias must be 50 characters or fewer')
                .trim(),
        )
        .max(5, 'A maximum of 5 aliases is allowed')
        .default([]),
});

export type CreateCompetitorInput = z.infer<typeof CreateCompetitorSchema>;

/**
 * Validation schema for updating a competitor.
 * All fields are optional — only provided fields are applied.
 *
 * Requirement 2.2, 17.1
 */
export const UpdateCompetitorSchema = z.object({
    name: z
        .string()
        .min(1, 'Competitor name is required')
        .max(100, 'Competitor name must be 100 characters or fewer')
        .trim()
        .optional(),

    domain: competitorDomainSchema.optional(),

    aliases: z
        .array(
            z
                .string()
                .min(1, 'Alias must not be empty')
                .max(50, 'Each alias must be 50 characters or fewer')
                .trim(),
        )
        .max(5, 'A maximum of 5 aliases is allowed')
        .optional(),
});

export type UpdateCompetitorInput = z.infer<typeof UpdateCompetitorSchema>;
