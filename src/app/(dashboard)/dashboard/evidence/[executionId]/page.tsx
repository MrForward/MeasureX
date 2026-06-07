import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/utils';
import { db } from '@/lib/db';
import { loadEvidence } from '@/lib/dashboard/evidence';
import { EvidenceView } from '@/components/dashboard/evidence-view';

export const metadata: Metadata = {
    title: 'View source — MeasureX',
    description: 'Raw response and score breakdown behind a visibility metric.',
};

interface EvidencePageProps {
    params: { executionId: string };
}

/**
 * Evidence drill-down ("view source") for a single execution. Scoped to the
 * workspaces the signed-in user belongs to; 404s otherwise.
 */
export default async function EvidencePage({ params }: EvidencePageProps) {
    const session = await requireAuth();
    const userId = session.user?.id;
    if (!userId) throw new Error('Authenticated session is missing user id');

    const memberships = await db.workspaceMember.findMany({
        where: { userId, workspace: { deletedAt: null } },
        select: { workspaceId: true },
    });
    const workspaceIds = memberships.map((m) => m.workspaceId);

    const evidence =
        workspaceIds.length > 0
            ? await loadEvidence(params.executionId, workspaceIds)
            : null;

    if (!evidence) {
        notFound();
    }

    return <EvidenceView data={evidence} />;
}
