import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/api/auth';
import { db } from '@/lib/db';
import { ManageBillingButton } from '@/components/dashboard/manage-billing-button';
import { PromptManager } from '@/components/dashboard/prompt-manager';
import { SignOutButton } from '@/components/dashboard/sign-out-button';

type Category = 'category' | 'comparison' | 'buyer_intent';

export const metadata: Metadata = { title: 'Settings — MeasureX' };

const STATUS: Record<string, { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700' },
    past_due: { label: 'Past due', className: 'bg-amber-100 text-amber-700' },
    canceled: { label: 'Canceled', className: 'bg-red-100 text-red-700' },
    inactive: { label: 'Inactive', className: 'bg-slate-100 text-slate-600' },
};

export default async function SettingsPage() {
    const user = await getCurrentUser();
    if (!user) {
        redirect('/login?callbackUrl=/dashboard/settings');
    }

    const brand = await db.brand.findUnique({
        where: { userId: user.id },
        select: {
            id: true,
            name: true,
            domain: true,
            prompts: {
                orderBy: { createdAt: 'asc' },
                select: { id: true, text: true, category: true, active: true },
            },
        },
    });
    const status = STATUS[user.subscriptionStatus] ?? STATUS.inactive;

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Settings</h1>
                <Link href="/dashboard" className="text-sm font-medium text-brand-600 hover:underline">
                    ← Back to dashboard
                </Link>
            </div>

            {/* Account */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Account</h2>
                <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Email</dt>
                        <dd className="font-medium text-slate-900">{user.email}</dd>
                    </div>
                    {brand && (
                        <div className="flex justify-between gap-4">
                            <dt className="text-slate-500">Brand</dt>
                            <dd className="font-medium text-slate-900">{brand.name} · {brand.domain}</dd>
                        </div>
                    )}
                </dl>
            </section>

            {/* Prompts (PRD §F12) */}
            {brand ? (
                <PromptManager
                    initialPrompts={brand.prompts.map((p) => ({
                        id: p.id,
                        text: p.text,
                        category: p.category as Category,
                        active: p.active,
                    }))}
                />
            ) : (
                <section className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
                    Complete onboarding to manage your prompts.
                </section>
            )}

            {/* Subscription */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Subscription</h2>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-slate-500">Status</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>
                            {status.label}
                        </span>
                        <span className="text-sm text-slate-500">· $9/month</span>
                    </div>
                    <ManageBillingButton />
                </div>
                <p className="mt-3 text-xs text-slate-400">
                    Manage your plan, payment method, or cancel anytime in the billing portal.
                </p>
            </section>

            {/* Session */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Session</h2>
                <div className="mt-4">
                    <SignOutButton />
                </div>
            </section>
        </div>
    );
}
