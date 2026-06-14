'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Starts a Stripe Checkout session (PRD §F1 CTA → §F2 Checkout) and redirects.
 * On failure (e.g. billing not configured) it surfaces a small toast rather than
 * silently failing.
 */
export function CheckoutButton({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    async function startCheckout() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/stripe/checkout', { method: 'POST' });
            const body = await res.json().catch(() => null);
            if (res.ok && body?.data?.url) {
                window.location.href = body.data.url as string;
                return;
            }
            setError(body?.error?.message ?? 'Could not start checkout. Please try again.');
        } catch {
            setError('Could not start checkout. Please try again.');
        }
        setLoading(false);
    }

    return (
        <>
            <button
                type="button"
                onClick={startCheckout}
                disabled={loading}
                className={cn('disabled:opacity-70', className)}
                aria-busy={loading}
            >
                {loading ? 'Redirecting…' : children}
            </button>
            {error && (
                <div
                    role="alert"
                    className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit max-w-[90%] rounded-lg border border-red-200 bg-white px-4 py-3 text-sm text-red-700 shadow-lg"
                >
                    {error}
                    <button type="button" onClick={() => setError(null)} className="ml-3 font-medium text-slate-400 hover:text-slate-700" aria-label="Dismiss">×</button>
                </div>
            )}
        </>
    );
}
