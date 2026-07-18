import { z } from 'zod';

/**
 * Prompt validation schemas.
 *
 * Encodes the prompt rules from the spec:
 *   - text length 10–500 chars                         (Req 16.1)
 *   - intent ∈ {informational, navigational,           (Req 16.4)
 *               commercial, transactional}
 *   - at least one engine, from the known set          (Req 3.7)
 *   - topic / geography / language attributes          (Req 3.2)
 *
 * The max-active-prompts limit (Req 3.3) and duplicate-similarity warning
 * (Req 16.2) are enforced in the route, not here, because they require a DB
 * lookup against the rest of the workspace.
 */

export const PROMPT_MIN_LENGTH = 10;
export const PROMPT_MAX_LENGTH = 500;

export const PROMPT_INTENTS = [
    'informational',
    'navigational',
    'commercial',
    'transactional',
] as const;

export const PROMPT_ENGINES = ['chatgpt', 'perplexity'] as const;

const textSchema = z
    .string()
    .trim()
    .min(PROMPT_MIN_LENGTH, `Prompt text must be at least ${PROMPT_MIN_LENGTH} characters`)
    .max(PROMPT_MAX_LENGTH, `Prompt text must be ${PROMPT_MAX_LENGTH} characters or fewer`);

const intentSchema = z.enum(PROMPT_INTENTS, {
    errorMap: () => ({
        message: `Intent must be one of: ${PROMPT_INTENTS.join(', ')}`,
    }),
});

const enginesSchema = z
    .array(
        z.enum(PROMPT_ENGINES, {
            errorMap: () => ({
                message: `Engine must be one of: ${PROMPT_ENGINES.join(', ')}`,
            }),
        }),
    )
    .min(1, 'At least one engine must be selected')
    // De-duplicate while preserving order.
    .transform((engines) => Array.from(new Set(engines)));

const topicSchema = z
    .string()
    .trim()
    .max(100, 'Topic must be 100 characters or fewer');

/**
 * Create-prompt input. `intent` and `engines` are required (Req 3.2, 3.7);
 * geography/language fall back to the schema defaults used across the app.
 */
export const CreatePromptSchema = z.object({
    text: textSchema,
    intent: intentSchema,
    topic: topicSchema.optional(),
    geography: z.string().trim().min(1).max(60).default('US'),
    language: z.string().trim().min(2).max(10).default('en'),
    engines: enginesSchema,
});

export type CreatePromptInput = z.infer<typeof CreatePromptSchema>;

/**
 * Update-prompt input — every field optional. Editing `text` is handled
 * specially by the route (creates a new version, Req 3.6); other fields are
 * applied in place. `status` allows archiving via PATCH as an alternative to
 * DELETE.
 */
export const UpdatePromptSchema = z
    .object({
        text: textSchema.optional(),
        intent: intentSchema.optional(),
        topic: topicSchema.optional(),
        geography: z.string().trim().min(1).max(60).optional(),
        language: z.string().trim().min(2).max(10).optional(),
        engines: enginesSchema.optional(),
        status: z.enum(['active', 'archived']).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: 'At least one field must be provided',
    });

export type UpdatePromptInput = z.infer<typeof UpdatePromptSchema>;
