/**
 * Stripe client + config helpers (PRD §F2).
 *
 * The client is lazily constructed so importing this module never throws when
 * keys are absent (e.g. local dev / tests). Routes call `isStripeConfigured()`
 * first and return a clean 503 when billing isn't set up.
 */

import Stripe from 'stripe';

let cached: Stripe | null = null;

/** True when the secret key and price id are present. */
export function isStripeConfigured(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

/** Lazily-constructed Stripe client. Throws only when actually used without a key. */
export function getStripe(): Stripe {
    if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error('STRIPE_SECRET_KEY is not set');
    }
    if (!cached) {
        cached = new Stripe(process.env.STRIPE_SECRET_KEY);
    }
    return cached;
}

/** Absolute base URL for Stripe success/cancel redirects. */
export function appUrl(): string {
    return process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
}
