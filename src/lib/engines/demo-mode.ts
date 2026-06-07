/**
 * DEMO_MODE — deterministic canned engine responses for local development and
 * sales demos (design.md §"Demo Mode").
 *
 * When `DEMO_MODE=true`, execute-job skips the real engine APIs (no credits
 * spent, no keys required) and uses these fixtures instead. The fixtures
 * reference the seeded HubSpot brand and its competitors so the extraction and
 * metrics pipeline produces realistic, non-zero visibility scores end-to-end.
 *
 * Determinism: the same prompt text always yields the same response (selected
 * by a stable hash of the text), so re-running a demo is reproducible.
 */

import type { EngineId } from '@/types';
import type { PromptInput, StandardizedResponse } from './types';
import type { Citation } from '@/types';

/** True when the app is running in demo mode. */
export function isDemoMode(): boolean {
    return process.env.DEMO_MODE === 'true';
}

/** Stable non-cryptographic hash of a string → non-negative integer. */
function stableHash(text: string): number {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
        h = (h * 31 + text.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

interface DemoTemplate {
    text: string;
    citations: Citation[];
}

/**
 * Canned answer templates referencing the seeded HubSpot brand + competitors.
 * Varied so different prompts surface different mention positions / citations,
 * exercising all four scoring factors.
 */
const TEMPLATES: DemoTemplate[] = [
    {
        text:
            'HubSpot is widely recommended as the best all-in-one CRM and marketing ' +
            'platform for growing teams. It offers strong inbound tooling, and many ' +
            'reviewers consider it the top choice over Salesforce for SMBs. Zoho CRM ' +
            'and Pipedrive are also worth evaluating for tighter budgets.',
        citations: [
            { url: 'https://hubspot.com/products/crm', domain: 'hubspot.com', classification: 'other' },
            { url: 'https://g2.com/categories/crm', domain: 'g2.com', classification: 'other' },
            { url: 'https://salesforce.com/crm', domain: 'salesforce.com', classification: 'other' },
        ],
    },
    {
        text:
            'For project and customer management, popular options include Salesforce, ' +
            'Monday.com, and ActiveCampaign. HubSpot is frequently mentioned as a ' +
            'strong contender thanks to its free tier and ease of use.',
        citations: [
            { url: 'https://salesforce.com', domain: 'salesforce.com', classification: 'other' },
            { url: 'https://monday.com', domain: 'monday.com', classification: 'other' },
        ],
    },
    {
        text:
            'Several CRMs compete in this space. Zoho CRM and Pipedrive lead on price, ' +
            'while Salesforce leads on enterprise features. HubSpot rounds out the ' +
            'list as a balanced, marketer-friendly option.',
        citations: [
            { url: 'https://zoho.com/crm', domain: 'zoho.com', classification: 'other' },
            { url: 'https://hubspot.com/pricing', domain: 'hubspot.com', classification: 'other' },
        ],
    },
];

const MODEL_VERSIONS: Record<EngineId, string> = {
    chatgpt: 'demo-gpt-4o-mini',
    perplexity: 'demo-sonar-small',
    google_ai: 'demo-serp-ai-overview',
};

/**
 * Build a deterministic demo response for an engine + prompt.
 */
export function buildDemoResponse(
    engine: EngineId,
    prompt: PromptInput,
): StandardizedResponse {
    const template = TEMPLATES[stableHash(prompt.text) % TEMPLATES.length];

    return {
        rawText: template.text,
        citations: template.citations.map((c) => ({ ...c })),
        metadata: { demo: true, engine, prompt: prompt.text },
        modelVersion: MODEL_VERSIONS[engine] ?? 'demo-unknown',
        timestamp: new Date(),
        executionTimeMs: 5,
    };
}
