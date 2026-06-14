/**
 * Stripe webhook → user subscription state machine (PRD §F2), pure & testable.
 *
 * Maps a verified Stripe event to the intended `User` mutation. The route layer
 * performs the mutation (idempotently) — this module decides WHAT should happen,
 * so the mapping is unit-tested without Stripe or the DB.
 *
 * Events handled (PRD §F2 webhook table):
 *   - checkout.session.completed → create/activate the user (status "active").
 *   - customer.subscription.deleted → status "canceled" (Run Scan is then blocked).
 *   - invoice.payment_failed → status "past_due" (scans blocked until "active").
 *   Everything else → ignored.
 */

export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'inactive';

export type WebhookOutcome =
    | {
          kind: 'activate';
          email: string;
          stripeCustomerId: string;
          stripeSubscriptionId: string | null;
      }
    | { kind: 'set_status'; stripeCustomerId: string; status: 'canceled' | 'past_due'; attemptCount: number }
    | { kind: 'ignored' };

/** A minimal, SDK-agnostic view of a Stripe event (so tests need no Stripe types). */
export interface MinimalStripeEvent {
    type: string;
    data: { object: Record<string, unknown> };
}

/** Coerce a Stripe field that may be an id string or an expanded `{ id }` object. */
function toId(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
        return (value as { id: string }).id;
    }
    return null;
}

/** Decide the user mutation implied by a webhook event. */
export function resolveWebhookOutcome(event: MinimalStripeEvent): WebhookOutcome {
    const obj = event.data?.object ?? {};

    switch (event.type) {
        case 'checkout.session.completed': {
            const email =
                (obj.customer_email as string | undefined) ??
                ((obj.customer_details as { email?: string } | undefined)?.email);
            const stripeCustomerId = toId(obj.customer);
            if (!email || !stripeCustomerId) {
                return { kind: 'ignored' };
            }
            return {
                kind: 'activate',
                email: email.toLowerCase(),
                stripeCustomerId,
                stripeSubscriptionId: toId(obj.subscription),
            };
        }

        case 'customer.subscription.deleted': {
            const stripeCustomerId = toId(obj.customer);
            if (!stripeCustomerId) return { kind: 'ignored' };
            return { kind: 'set_status', stripeCustomerId, status: 'canceled', attemptCount: 0 };
        }

        case 'invoice.payment_failed': {
            const stripeCustomerId = toId(obj.customer);
            if (!stripeCustomerId) return { kind: 'ignored' };
            const attemptCount = typeof obj.attempt_count === 'number' ? obj.attempt_count : 0;
            return { kind: 'set_status', stripeCustomerId, status: 'past_due', attemptCount };
        }

        default:
            return { kind: 'ignored' };
    }
}

/** PRD §F2: warn, then block new scans after 3 consecutive payment failures. */
export const MAX_PAYMENT_FAILURES = 3;

/** Whether a past_due failure has reached the hard-block threshold. */
export function isHardBlocked(outcome: WebhookOutcome): boolean {
    return (
        outcome.kind === 'set_status' &&
        outcome.status === 'past_due' &&
        outcome.attemptCount >= MAX_PAYMENT_FAILURES
    );
}
