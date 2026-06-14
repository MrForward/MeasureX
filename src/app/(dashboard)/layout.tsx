import * as React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/api/auth';
import { db } from '@/lib/db';
import { SignOutButton } from '@/components/dashboard/sign-out-button';

/**
 * Dashboard shell (brand-scoped — one user, one brand). Redirects unauthenticated
 * users to /login and not-yet-onboarded users to /onboarding.
 *
 * NOTE: this is the minimal shell for the §F3 onboarding landing. The full
 * dashboard (PRD §F7/§F8) is built in a later chunk.
 */
export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await getCurrentUser();
    if (!user) {
        redirect('/login?callbackUrl=/dashboard');
    }

    const brand = await db.brand.findUnique({
        where: { userId: user.id },
        select: { id: true },
    });
    if (!brand) {
        redirect('/onboarding');
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="border-b border-slate-200 bg-white">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
                    <Link href="/dashboard" className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-brand-gradient" aria-hidden="true" />
                        <span className="text-lg font-bold text-slate-900">MeasureX</span>
                    </Link>
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span className="hidden md:inline">{user.email}</span>
                        <Link href="/dashboard/settings" className="font-medium text-slate-600 transition-colors hover:text-slate-900">
                            Settings
                        </Link>
                        <SignOutButton />
                    </div>
                </div>
            </header>
            <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
        </div>
    );
}
