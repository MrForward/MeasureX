/**
 * POST /api/stripe/checkout — create a $9/mo subscription Checkout session (PRD §F2).
 * Pre-auth (the landing CTA calls this). Returns the Checkout URL to redirect to.
 */

import { apiSuccess, apiError } from '@/lib/api/response';
import { getStripe, isStripeConfigured, appUrl } from '@/lib/stripe/client';

export async function POST() {
    if (!isStripeConfigured()) {
        return apiError('Billing is not configured yet.', 'BILLING_UNCONFIGURED', 503);
    }

    try {
        const session = await getStripe().checkout.sessions.create({
            mode: 'subscription',
            line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
            success_url: `${appUrl()}/welcome?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${appUrl()}/`,
            allow_promotion_codes: true,
            billing_address_collection: 'auto',
        });
        return apiSuccess({ url: session.url });
    } catch {
        return apiError('Could not start checkout. Please try again.', 'CHECKOUT_FAILED', 502);
    }
}
