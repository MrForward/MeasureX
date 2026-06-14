/**
 * Perplexity runner (PRD §F4b) — Sonar API (OpenAI-compatible).
 *
 * Spec (verbatim from PRD §F4b):
 *   model: sonar, temperature: 0.7, max_tokens: 1500
 *   system: same as ChatGPT (see ENGINE_SYSTEM_PROMPT)
 *   Perplexity returns a native `citations` array of URL strings → captured
 *   into nativeCitations.
 *
 * Uses the OpenAI SDK pointed at the Perplexity base URL.
 */

import OpenAI from 'openai';
import { executeEngineRun, type ExecuteEngineRunOptions } from './execute';
import { ENGINE_SYSTEM_PROMPT } from './chatgpt';
import type { CompletionCaller, EngineRunResult } from './types';

export const PERPLEXITY_MODEL = 'sonar';
export const PERPLEXITY_BASE_URL = 'https://api.perplexity.ai';

let cachedClient: OpenAI | null = null;

/** Lazily-constructed Perplexity client (OpenAI SDK + Perplexity base URL). */
export function getPerplexityClient(): OpenAI {
    if (cachedClient === null) {
        cachedClient = new OpenAI({
            apiKey: process.env.PERPLEXITY_API_KEY,
            baseURL: PERPLEXITY_BASE_URL,
        });
    }
    return cachedClient;
}

/** Build the low-level caller that performs one Perplexity completion. */
export function perplexityCaller(
    promptText: string,
    client: OpenAI = getPerplexityClient(),
): CompletionCaller {
    return async (signal) => {
        const completion = (await client.chat.completions.create(
            {
                model: PERPLEXITY_MODEL,
                temperature: 0.7,
                max_tokens: 1500,
                messages: [
                    { role: 'system', content: ENGINE_SYSTEM_PROMPT },
                    { role: 'user', content: promptText },
                ],
            },
            { signal },
        )) as OpenAI.Chat.Completions.ChatCompletion & { citations?: string[] };

        return {
            content: completion.choices?.[0]?.message?.content ?? '',
            citations: completion.citations ?? [],
            tokensUsed: completion.usage?.total_tokens ?? null,
            model: completion.model ?? PERPLEXITY_MODEL,
        };
    };
}

/** Run a single prompt through Perplexity, returning a persist-ready result. */
export function runPerplexity(
    promptText: string,
    opts: ExecuteEngineRunOptions & { client?: OpenAI } = {},
): Promise<EngineRunResult> {
    const { client, ...rest } = opts;
    return executeEngineRun(
        'perplexity',
        PERPLEXITY_MODEL,
        perplexityCaller(promptText, client),
        rest,
    );
}
