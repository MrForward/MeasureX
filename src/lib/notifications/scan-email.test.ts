/**
 * Unit tests for the scan-completion email (PRD §F10).
 */

import { describe, it, expect } from 'vitest';
import { buildScanEmail, summarizeForEmail, type SummaryRecord } from './scan-email';

const COMPETITORS = [
    { id: 'c1', name: 'Otterly' },
    { id: 'c2', name: 'Peec' },
];

function rec(promptId: string, brandMentioned: boolean, comps: Record<string, boolean>): SummaryRecord {
    return {
        promptId,
        extraction: {
            brandMentioned,
            competitorResults: Object.entries(comps).map(([competitorId, mentioned]) => ({ competitorId, mentioned })),
        },
    };
}

describe('summarizeForEmail', () => {
    it('counts distinct prompts where the brand was mentioned (across engines)', () => {
        const records = [
            rec('p1', true, {}), // chatgpt
            rec('p1', false, {}), // perplexity — same prompt, already counted
            rec('p2', true, {}),
            rec('p3', false, {}),
        ];
        const { mentionedPrompts } = summarizeForEmail(records, COMPETITORS);
        expect(mentionedPrompts).toBe(2);
    });

    it('finds the competitor with the largest gap (mentioned where brand absent)', () => {
        const records = [
            rec('p1', false, { c1: true, c2: false }),
            rec('p2', false, { c1: true, c2: true }),
            rec('p3', true, { c1: true, c2: false }), // brand present → not a gap
        ];
        const { competitorGap } = summarizeForEmail(records, COMPETITORS);
        expect(competitorGap).toEqual({ name: 'Otterly', count: 2 });
    });

    it('returns null gap when no competitor outranks the brand', () => {
        const records = [rec('p1', true, { c1: true }), rec('p2', true, { c1: false })];
        expect(summarizeForEmail(records, COMPETITORS).competitorGap).toBeNull();
    });

    it('ignores failed runs (null extraction)', () => {
        const records: SummaryRecord[] = [{ promptId: 'p1', extraction: null }, rec('p2', true, {})];
        expect(summarizeForEmail(records, COMPETITORS).mentionedPrompts).toBe(1);
    });
});

describe('buildScanEmail', () => {
    const base = {
        to: 'a@b.com', score: 48, mentionedPrompts: 12, totalPrompts: 20, engineCount: 2,
        competitorGap: null, dashboardUrl: 'https://app.measurex.io/dashboard',
    };

    it('formats the subject with score and positive delta', () => {
        const { subject } = buildScanEmail({ ...base, delta: 5 });
        expect(subject).toBe('MeasureX: Your visibility is 48 (+5 this week)');
    });

    it('formats the subject for a first scan (null delta) and negative delta', () => {
        expect(buildScanEmail({ ...base, delta: null }).subject).toBe('MeasureX: Your visibility is 48 (first scan)');
        expect(buildScanEmail({ ...base, delta: -3 }).subject).toBe('MeasureX: Your visibility is 48 (-3 this week)');
    });

    it('includes mention count, dashboard CTA, and competitor warning when present', () => {
        const { html } = buildScanEmail({ ...base, delta: 5, competitorGap: { name: 'Otterly', count: 7 } });
        expect(html).toContain('Mentioned in <strong>12 of 20</strong> prompts across 2 engines');
        expect(html).toContain('https://app.measurex.io/dashboard');
        expect(html).toContain('View your dashboard →');
        expect(html).toContain('Otterly appeared on 7 prompts where your brand didn');
    });

    it('omits the competitor warning when there is no gap, and escapes names', () => {
        const noGap = buildScanEmail({ ...base, delta: 0 });
        expect(noGap.html).not.toContain('appeared on');
        const xss = buildScanEmail({ ...base, delta: 1, competitorGap: { name: '<script>x</script>', count: 1 } });
        expect(xss.html).not.toContain('<script>x</script>');
        expect(xss.html).toContain('&lt;script&gt;');
    });
});
