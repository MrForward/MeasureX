/**
 * Prompt suggestions for onboarding.
 *
 * Generates starter monitoring prompts from the brand name, spanning all four
 * intent categories (Req 16.5). This is the rule-based/demo implementation; an
 * LLM-backed version (Claude Sonnet / GPT-4o per design) is a later enhancement
 * that can replace `suggestPrompts` without changing the wizard.
 *
 * Validates: Requirement 3.1 (AI-suggested prompts on workspace creation),
 *            16.5 (suggestions span all four intent categories)
 */

import type { PromptIntent } from '@/types';

export interface SuggestedPrompt {
    text: string;
    intent: PromptIntent;
}

/** Trim and collapse whitespace in a brand name for use in prompt text. */
function clean(brandName: string): string {
    return brandName.trim().replace(/\s+/g, ' ');
}

/**
 * Suggest starter prompts for a brand. Always returns prompts across all four
 * intents (informational, navigational, commercial, transactional), each within
 * the 10–500 char validation range.
 */
export function suggestPrompts(brandName: string): SuggestedPrompt[] {
    const brand = clean(brandName) || 'your brand';

    return [
        { text: `What is ${brand} and how does it work?`, intent: 'informational' },
        { text: `${brand} pricing and plans explained`, intent: 'informational' },
        { text: `${brand} vs its top competitors`, intent: 'navigational' },
        { text: `Best alternatives to ${brand}`, intent: 'commercial' },
        { text: `Is ${brand} worth it for growing teams?`, intent: 'commercial' },
        { text: `Best tools like ${brand} to try this year`, intent: 'transactional' },
    ];
}
