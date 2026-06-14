'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';

/** Opens the Stripe Customer Portal (PRD §F2). */
export function ManageBillingButton() {
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    async function openPortal() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/stripe/portal', { method: 'POST' });
            const body = await res.json().catch(() => null);
            if (res.ok && body?.data?.url) {
                window.location.href = body.data.url as string;
                return;
            }
            setError(body?.error?.message ?? 'Could not open the billing portal.');
        } catch {
            setError('Could not open the billing portal.');
        }
        setLoading(false);
    }

    return (
        <div>
            <Button variant="outline" onClick={openPortal} disabled={loading}>
                {loading ? 'Opening…' : 'Manage billing'}
            </Button>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
    );
}
