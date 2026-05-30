import { z } from 'zod';

/**
 * Normalizes a domain/URL string:
 * - Strips protocol (http:// or https://)
 * - Strips trailing slashes
 * - Lowercases the result
 *
 * Examples:
 *   "https://hubspot.com/"  → "hubspot.com"
 *   "http://www.example.com" → "www.example.com"
 *   "hubspot.com"           → "hubspot.com"
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
 * Accepts:
 *   - Plain domains:  "hubspot.com", "www.example.co.uk"
 *   - URLs:           "https://hubspot.com", "http://example.com/path"
 *
 * Requirement 2.5: primary domain must be a well-formed URL or domain string.
 */
const domainSchema = z
    .string()
    .min(1, 'Domain is required')
    .transform((val) => normalizeDomain(val))
    .refine(
        (val) => {
            // After stripping protocol, must look like a valid domain
            // Accepts: example.com, sub.example.co.uk, localhost (dev), etc.
            const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;
            return domainRegex.test(val);
        },
        { message: 'Domain must be a valid domain (e.g. "hubspot.com") or URL (e.g. "https://hubspot.com")' },
    );

/**
 * Validation schema for creating a brand profile.
 *
 * Requirement 2.1: brand name, primary domain, up to 3 aliases
 * Requirement 2.5: domain validation
 * Requirement 12.2: brand profile versioning (version managed server-side)
 */
export const CreateBrandProfileSchema = z.object({
    brandName: z
        .string()
        .min(1, 'Brand name is required')
        .max(100, 'Brand name must be 100 characters or fewer')
        .trim(),

    domain: domainSchema,

    aliases: z
        .array(
            z
                .string()
                .min(1, 'Alias must not be empty')
                .max(50, 'Each alias must be 50 characters or fewer')
                .trim(),
        )
        .max(3, 'A maximum of 3 aliases is allowed')
        .default([]),
});

export type CreateBrandProfileInput = z.infer<typeof CreateBrandProfileSchema>;

/**
 * Validation schema for updating a brand profile.
 * All fields are optional — only provided fields are applied.
 *
 * Requirement 2.1, 2.5, 12.2
 */
export const UpdateBrandProfileSchema = z.object({
    brandName: z
        .string()
        .min(1, 'Brand name is required')
        .max(100, 'Brand name must be 100 characters or fewer')
        .trim()
        .optional(),

    domain: domainSchema.optional(),

    aliases: z
        .array(
            z
                .string()
                .min(1, 'Alias must not be empty')
                .max(50, 'Each alias must be 50 characters or fewer')
                .trim(),
        )
        .max(3, 'A maximum of 3 aliases is allowed')
        .optional(),
});

export type UpdateBrandProfileInput = z.infer<typeof UpdateBrandProfileSchema>;
