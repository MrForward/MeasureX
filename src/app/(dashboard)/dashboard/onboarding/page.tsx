import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/utils';
import { db } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { OnboardingWizard } from '@/components/dashboard/onboarding-wizard';

export const metadata: Metadata = { title: 'Get started — MeasureX' };

interface OnboardingPageProps {
    searchParams: { workspace?: string };
}

/**
 * Onboarding wizard (Requirement 11): brand → competitors → suggested prompts →
 * baseline scan. Configures the active workspace.
 */
export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
    const session = await requireAuth();
    const userId = session.user?.id;
    if (!userId) throw new Error('Authenticated session is missing user id');

    const memberships = await db.workspaceMember.findMany({
        where: { userId, workspace: { deletedAt: null } },
        include: { workspace: true },
        orderBy: { createdAt: 'asc' },
    });
    const byId = new Map(memberships.map((m) => [m.workspaceId, m]));
    const requested = searchParams.workspace;
    const active = (requested && byId.get(requested)) || memberships[0] || null;

    if (!active) {
        return (
            <Card className="p-8 text-center">
                <p className="text-sm text-slate-500">You aren&apos;t a member of any workspace yet.</p>
            </Card>
        );
    }

    return (
        <div className="space-y-8">
            <header className="space-y-1 text-center">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                    Welcome to MeasureX
                </h1>
                <p className="text-sm text-slate-500">
                    Let&apos;s set up your brand monitoring — it takes about a minute.
                </p>
            </header>
            <OnboardingWizard
                workspaceId={active.workspaceId}
                defaultBrandName={active.workspace.name}
            />
        </div>
    );
}
