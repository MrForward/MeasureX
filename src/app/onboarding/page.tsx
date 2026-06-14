import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/api/auth';
import { db } from '@/lib/db';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';

export const metadata: Metadata = { title: 'Get started — MeasureX' };

/**
 * Onboarding (PRD §F3). Reached after sign-in / Stripe checkout. Redirects to
 * /login when unauthenticated and to /dashboard when the user already onboarded
 * (one brand per account).
 */
export default async function OnboardingPage() {
    const user = await getCurrentUser();
    if (!user) {
        redirect('/login?callbackUrl=/onboarding');
    }

    const brand = await db.brand.findUnique({
        where: { userId: user.id },
        select: { id: true },
    });
    if (brand) {
        redirect('/dashboard');
    }

    return (
        <main className="min-h-screen bg-slate-50">
            <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
                <header className="mb-8 text-center">
                    <div className="mb-4 inline-flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-brand-gradient" aria-hidden="true" />
                        <span className="text-xl font-bold text-slate-900">MeasureX</span>
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                        Set up your brand monitoring
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">It takes about a minute.</p>
                </header>
                <OnboardingWizard />
            </div>
        </main>
    );
}
