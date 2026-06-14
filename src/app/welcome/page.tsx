import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { getStripe, isStripeConfigured } from '@/lib/stripe/client';

export const metadata: Metadata = { title: 'Welcome — MeasureX' };

/**
 * Post-checkout confirmation (PRD §F2 success URL). Confirms payment and points
 * the user to onboarding (signing in first if needed). The Stripe webhook
 * creates the account in the background.
 */
export default async function WelcomePage({
    searchParams,
}: {
    searchParams: { session_id?: string };
}) {
    const sessionId = searchParams.session_id;
    let email: string | null = null;

    if (sessionId && isStripeConfigured()) {
        try {
            const session = await getStripe().checkout.sessions.retrieve(sessionId);
            email = session.customer_details?.email ?? session.customer_email ?? null;
        } catch {
            email = null;
        }
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                    <CheckCircle2 className="h-7 w-7 text-emerald-600" aria-hidden="true" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">You&apos;re all set</h1>
                <p className="mt-2 text-sm text-slate-500">
                    {email ? (
                        <>Your MeasureX subscription is active for <span className="font-medium text-slate-700">{email}</span>.</>
                    ) : (
                        <>Your MeasureX subscription is active.</>
                    )}{' '}
                    Sign in with that email to finish setting up your brand monitoring.
                </p>
                <div className="mt-6">
                    <Link
                        href="/onboarding"
                        className="inline-block w-full rounded-lg bg-brand-gradient px-6 py-3 text-base font-semibold text-white transition hover:opacity-90"
                    >
                        Continue to setup
                    </Link>
                </div>
            </div>
        </main>
    );
}
