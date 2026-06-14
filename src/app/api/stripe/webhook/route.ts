/**
 * POST /api/stripe/webhook — Stripe subscription lifecycle (PRD §F2).
 *
 * Verifies the Stripe signature against the raw body, then applies the
 * idempotent user mutation decided by {@link resolveWebhookOutcome}:
 *   - activate  → upsert user (by email), status "active" + Stripe ids.
 *   - set_status→ canceled / past_due (matched by stripeCustomerId).
 *
 * Returns 200 to acknowledge; 400 on bad signature. Never uses the JSON
 * envelope — Stripe expects a plain 2xx.
 */

import type { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { getStripe, isStripeConfigured } from '@/lib/stripe/client';
import { resolveWebhookOutcome, type MinimalStripeEvent } from '@/lib/stripe/webhook-handler';

export async function POST(req: NextRequest) {
    if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
        return new Response('Billing not configured', { status: 503 });
    }

    const signature = headers().get('stripe-signature');
    if (!signature) {
        return new Response('Missing signature', { status: 400 });
    }

    const rawBody = await req.text();
    let event: MinimalStripeEvent;
    try {
        event = getStripe().webhooks.constructEvent(
            rawBody,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET,
        ) as unknown as MinimalStripeEvent;
    } catch {
        return new Response('Invalid signature', { status: 400 });
    }

    const outcome = resolveWebhookOutcome(event);

    try {
        if (outcome.kind === 'activate') {
            // Idempotent: same checkout event twice writes the same row/values.
            await db.user.upsert({
                where: { email: outcome.email },
                create: {
                    email: outcome.email,
                    subscriptionStatus: 'active',
                    stripeCustomerId: outcome.stripeCustomerId,
                    stripeSubscriptionId: outcome.stripeSubscriptionId ?? undefined,
                },
                update: {
                    subscriptionStatus: 'active',
                    stripeCustomerId: outcome.stripeCustomerId,
                    stripeSubscriptionId: outcome.stripeSubscriptionId ?? undefined,
                },
            });
        } else if (outcome.kind === 'set_status') {
            await db.user.updateMany({
                where: { stripeCustomerId: outcome.stripeCustomerId },
                data: { subscriptionStatus: outcome.status },
            });
            // NOTE: PRD §F2 also sends a warning email on past_due via Resend —
            // wired when RESEND_API_KEY is configured (see §F10).
        }
    } catch {
        // Returning 500 makes Stripe retry — safe because the mutation is idempotent.
        return new Response('Handler error', { status: 500 });
    }

    return new Response('ok', { status: 200 });
}
