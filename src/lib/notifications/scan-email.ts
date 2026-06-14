/**
 * Scan-completion email (PRD §F10).
 *
 * `buildScanEmail` + `summarizeForEmail` are pure (unit-tested). `sendScanEmail`
 * sends via Resend when `RESEND_API_KEY` is set, otherwise logs the email to the
 * console so the flow is testable without a live key (per the F10 dev fallback).
 */

import { Resend } from 'resend';

export interface EmailCompetitorGap {
    name: string;
    count: number;
}

export interface ScanEmailInput {
    to: string;
    score: number;
    delta: number | null;
    mentionedPrompts: number;
    totalPrompts: number;
    engineCount: number;
    competitorGap: EmailCompetitorGap | null;
    dashboardUrl: string;
}

/** Minimal run-record shape needed for the email summary. */
export interface SummaryRecord {
    promptId: string;
    extraction: {
        brandMentioned: boolean;
        competitorResults: Array<{ competitorId: string; mentioned: boolean }>;
    } | null;
}

/**
 * Compute the headline numbers for the email from a scan's run records:
 * how many distinct prompts mentioned the brand, and the competitor with the
 * largest "appears where you don't" gap (or null if none).
 */
export function summarizeForEmail(
    records: SummaryRecord[],
    competitors: Array<{ id: string; name: string }>,
): { mentionedPrompts: number; competitorGap: EmailCompetitorGap | null } {
    const promptsWithBrand = new Set<string>();
    for (const r of records) {
        if (r.extraction?.brandMentioned) {
            promptsWithBrand.add(r.promptId);
        }
    }

    let competitorGap: EmailCompetitorGap | null = null;
    for (const c of competitors) {
        let count = 0;
        for (const r of records) {
            const ext = r.extraction;
            if (!ext || ext.brandMentioned) continue;
            const mentioned = ext.competitorResults.find((cr) => cr.competitorId === c.id)?.mentioned ?? false;
            if (mentioned) count += 1;
        }
        if (count > 0 && (competitorGap === null || count > competitorGap.count)) {
            competitorGap = { name: c.name, count };
        }
    }

    return { mentionedPrompts: promptsWithBrand.size, competitorGap };
}

function deltaLabel(delta: number | null): string {
    if (delta === null) return '(first scan)';
    if (delta > 0) return `(+${delta} this week)`;
    if (delta < 0) return `(${delta} this week)`;
    return '(no change this week)';
}

function deltaArrow(delta: number | null): string {
    if (delta === null || delta === 0) return '';
    return delta > 0 ? '▲' : '▼';
}

/** Escape interpolated values for safe HTML rendering. */
function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Build the subject + mobile-friendly HTML body (PRD §F10). */
export function buildScanEmail(input: ScanEmailInput): { subject: string; html: string } {
    const subject = `MeasureX: Your visibility is ${input.score} ${deltaLabel(input.delta)}`;
    const arrow = deltaArrow(input.delta);
    const deltaText = input.delta === null ? 'First scan' : `${arrow} ${input.delta > 0 ? '+' : ''}${input.delta} this week`;
    const deltaColor = input.delta === null || input.delta === 0 ? '#64748b' : input.delta > 0 ? '#059669' : '#dc2626';

    const gapBlock = input.competitorGap
        ? `<p style="margin:16px 0 0;padding:12px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;color:#92400e;font-size:14px;">⚠ ${esc(input.competitorGap.name)} appeared on ${input.competitorGap.count} prompt${input.competitorGap.count === 1 ? '' : 's'} where your brand didn't.</p>`
        : '';

    const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:24px 16px;">
    <div style="height:6px;background:linear-gradient(135deg,#5147e6 0%,#220296 100%);border-radius:8px 8px 0 0;"></div>
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px 24px;">
      <p style="margin:0;color:#64748b;font-size:14px;">Your AI visibility scan is complete.</p>
      <p style="margin:8px 0 0;font-size:44px;font-weight:700;color:#0f172a;line-height:1;">${input.score}<span style="font-size:20px;color:#94a3b8;font-weight:500;">/100</span></p>
      <p style="margin:6px 0 0;font-size:14px;font-weight:600;color:${deltaColor};">${deltaText}</p>
      <p style="margin:18px 0 0;font-size:15px;color:#334155;">Mentioned in <strong>${input.mentionedPrompts} of ${input.totalPrompts}</strong> prompts across ${input.engineCount} engines.</p>
      ${gapBlock}
      <a href="${esc(input.dashboardUrl)}" style="display:inline-block;margin-top:24px;background:linear-gradient(135deg,#5147e6 0%,#220296 100%);color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px;">View your dashboard →</a>
    </div>
    <p style="margin:16px 0 0;text-align:center;color:#94a3b8;font-size:12px;">— MeasureX</p>
  </div>
</body>
</html>`;

    return { subject, html };
}

/** Send the scan-completion email (Resend), or log it when no key is set. */
export async function sendScanEmail(input: ScanEmailInput): Promise<{ sent: boolean }> {
    const { subject, html } = buildScanEmail(input);
    const from = process.env.EMAIL_FROM ?? 'MeasureX <onboarding@resend.dev>';

    if (!process.env.RESEND_API_KEY) {
        // F10 dev fallback (intentional console log): no key → don't send, just log.
        console.log(
            `[scan-email] RESEND_API_KEY not set — would send to ${input.to}: "${subject}"`,
        );
        return { sent: false };
    }

    try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({ from, to: input.to, subject, html });
        return { sent: true };
    } catch {
        return { sent: false };
    }
}
