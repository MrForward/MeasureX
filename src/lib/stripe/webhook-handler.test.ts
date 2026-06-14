/**
 * Unit tests for the Stripe webhook state machine (PRD §F2).
 */

import { describe, it, expect } from 'vitest';
import { resolveWebhookOutcome, isHardBlocked, MAX_PAYMENT_FAILURES } from './webhook-handler';

describe('resolveWebhookOutcome', () => {
    it('activates a user on checkout.session.completed', () => {
        const out = resolveWebhookOutcome({
            type: 'checkout.session.completed',
            data: {
                object: {
                    customer: 'cus_123',
                    subscription: 'sub_123',
                    customer_details: { email: 'Buyer@Example.com' },
                },
            },
        });
        expect(out).toEqual({
            kind: 'activate',
            email: 'buyer@example.com',
            stripeCustomerId: 'cus_123',
            stripeSubscriptionId: 'sub_123',
        });
    });

    it('falls back to customer_email and expanded {id} objects', () => {
        const out = resolveWebhookOutcome({
            type: 'checkout.session.completed',
            data: { object: { customer: { id: 'cus_x' }, subscription: { id: 'sub_x' }, customer_email: 'a@b.com' } },
        });
        expect(out).toMatchObject({ kind: 'activate', email: 'a@b.com', stripeCustomerId: 'cus_x', stripeSubscriptionId: 'sub_x' });
    });

    it('ignores checkout completion missing email or customer', () => {
        expect(resolveWebhookOutcome({ type: 'checkout.session.completed', data: { object: { customer: 'cus_1' } } }).kind).toBe('ignored');
        expect(resolveWebhookOutcome({ type: 'checkout.session.completed', data: { object: { customer_email: 'a@b.com' } } }).kind).toBe('ignored');
    });

    it('cancels on customer.subscription.deleted', () => {
        const out = resolveWebhookOutcome({ type: 'customer.subscription.deleted', data: { object: { customer: 'cus_123' } } });
        expect(out).toEqual({ kind: 'set_status', stripeCustomerId: 'cus_123', status: 'canceled', attemptCount: 0 });
    });

    it('marks past_due on invoice.payment_failed with attempt count', () => {
        const out = resolveWebhookOutcome({ type: 'invoice.payment_failed', data: { object: { customer: 'cus_123', attempt_count: 2 } } });
        expect(out).toEqual({ kind: 'set_status', stripeCustomerId: 'cus_123', status: 'past_due', attemptCount: 2 });
    });

    it('ignores unrelated events', () => {
        expect(resolveWebhookOutcome({ type: 'customer.updated', data: { object: {} } }).kind).toBe('ignored');
    });
});

describe('isHardBlocked', () => {
    it('blocks only at/after the failure threshold', () => {
        const at = resolveWebhookOutcome({ type: 'invoice.payment_failed', data: { object: { customer: 'c', attempt_count: MAX_PAYMENT_FAILURES } } });
        const below = resolveWebhookOutcome({ type: 'invoice.payment_failed', data: { object: { customer: 'c', attempt_count: MAX_PAYMENT_FAILURES - 1 } } });
        expect(isHardBlocked(at)).toBe(true);
        expect(isHardBlocked(below)).toBe(false);
        expect(isHardBlocked({ kind: 'ignored' })).toBe(false);
    });
});
