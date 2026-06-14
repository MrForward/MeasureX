/**
 * POST /api/prompts/generate — generate 25 candidate prompts via Claude (PRD §F3).
 *
 * Returns the suggestions (not persisted) for the onboarding wizard to review,
 * edit, and select. Generation failures return a retryable error rather than
 * crashing (PRD §F3 acceptance: "show retry button, not crash").
 */

import type { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/api/response';
import { getCurrentUser } from '@/lib/api/auth';
import { generateInputSchema } from '@/lib/api/validation';
import { generatePromptSuggestions } from '@/lib/prompts/generate';

export async function POST(req: NextRequest) {
    const user = await getCurrentUser();
    if (!user) {
        return apiError('Authentication required', 'UNAUTHORIZED', 401);
    }

    const body = await req.json().catch(() => null);
    const parsed = generateInputSchema.safeParse(body);
    if (!parsed.success) {
        return apiError(parsed.error.issues[0]?.message ?? 'Invalid input', 'VALIDATION_ERROR', 400);
    }

    try {
        const prompts = await generatePromptSuggestions(parsed.data);
        return apiSuccess({ prompts });
    } catch {
        return apiError(
            'Could not generate prompts right now. Please try again.',
            'GENERATION_FAILED',
            502,
        );
    }
}
