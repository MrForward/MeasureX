/**
 * POST /api/stripe/portal — open the Stripe Customer Portal (PRD §F2 account mgmt).
 * Authenticated. Returns the portal URL for plan changes / cancellation / payment
 * method updates.
 */

import { apiSuccess, apiError } from '@/lib/api/response';
import { getCurrentUser } from '@/lib/api/auth';
import { getStripe, isStripeConfigured, appUrl } from '@/lib/stripe/client';

export async function POST() {
    const user = await getCurrentUser();
    if (!user) {
        return apiError('Authentication required', 'UNAUTHORIZED', 401);
    }
    if (!isStripeConfigured()) {
        return apiError('Billing is not configured yet.', 'BILLING_UNCONFIGURED', 503);
    }
    if (!user.stripeCustomerId) {
        return apiError('No billing account found for this user.', 'NO_CUSTOMER', 400);
    }

    try {
        const portal = await getStripe().billingPortal.sessions.create({
            customer: user.stripeCustomerId,
            return_url: `${appUrl()}/dashboard/settings`,
        });
        return apiSuccess({ url: portal.url });
    } catch {
        return apiError('Could not open billing portal. Please try again.', 'PORTAL_FAILED', 502);
    }
}
