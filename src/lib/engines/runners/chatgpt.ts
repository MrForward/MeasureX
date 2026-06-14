/**
 * ChatGPT runner (PRD §F4a) — OpenAI Chat Completions, gpt-4o-mini.
 *
 * Spec (verbatim from PRD §F4a):
 *   model: gpt-4o-mini, temperature: 0.7, max_tokens: 1500
 *   system: "You are a helpful assistant. Answer the user's question
 *            thoroughly. When relevant, recommend specific products, tools,
 *            or companies by name."
 *   ChatGPT does not return structured citations → nativeCitations is [].
 */

import OpenAI from 'openai';
import { executeEngineRun, type ExecuteEngineRunOptions } from './execute';
import type { CompletionCaller, EngineRunResult } from './types';

export const CHATGPT_MODEL = 'gpt-4o-mini';

/** Shared system prompt (PRD §F4a/§F4b). */
export const ENGINE_SYSTEM_PROMPT =
    "You are a helpful assistant. Answer the user's question thoroughly. " +
    'When relevant, recommend specific products, tools, or companies by name.';

let cachedClient: OpenAI | null = null;

/** Lazily-constructed OpenAI client (so importing this module needs no key). */
export function getOpenAIClient(): OpenAI {
    if (cachedClient === null) {
        cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return cachedClient;
}

/** Build the low-level caller that performs one ChatGPT completion. */
export function chatgptCaller(
    promptText: string,
    client: OpenAI = getOpenAIClient(),
): CompletionCaller {
    return async (signal) => {
        const completion = await client.chat.completions.create(
            {
                model: CHATGPT_MODEL,
                temperature: 0.7,
                max_tokens: 1500,
                messages: [
                    { role: 'system', content: ENGINE_SYSTEM_PROMPT },
                    { role: 'user', content: promptText },
                ],
            },
            { signal },
        );

        return {
            content: completion.choices?.[0]?.message?.content ?? '',
            citations: [], // ChatGPT returns no structured citations
            tokensUsed: completion.usage?.total_tokens ?? null,
            model: completion.model ?? CHATGPT_MODEL,
        };
    };
}

/** Run a single prompt through ChatGPT, returning a persist-ready result. */
export function runChatGPT(
    promptText: string,
    opts: ExecuteEngineRunOptions & { client?: OpenAI } = {},
): Promise<EngineRunResult> {
    const { client, ...rest } = opts;
    return executeEngineRun('chatgpt', CHATGPT_MODEL, chatgptCaller(promptText, client), rest);
}
