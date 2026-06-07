import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/utils';
import { db } from '@/lib/db';
import {
    PromptsManager,
    type PromptListItem,
} from '@/components/dashboard/prompts-manager';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = {
    title: 'Prompts — MeasureX',
    description: 'Manage the prompts MeasureX monitors across AI answer engines.',
};

interface PromptsPageProps {
    searchParams: { workspace?: string };
}

/**
 * Prompts management page.
 *
 * Resolves the active workspace (same rules as the dashboard overview), loads
 * its prompts on the server for a fast first paint, and hands them to the
 * client PromptsManager which performs create/edit/archive against the
 * /api/v1/.../prompts endpoints. `canEdit` gates write actions to owners
 * (the API enforces this too; the UI just hides controls for viewers).
 */
export default async function PromptsPage({ searchParams }: PromptsPageProps) {
    const session = await requireAuth();
    const userId = session.user?.id;
    if (!userId) {
        throw new Error('Authenticated session is missing user id');
    }

    const memberships = await db.workspaceMember.findMany({
        where: { userId, workspace: { deletedAt: null } },
        include: { workspace: true },
        orderBy: { createdAt: 'asc' },
    });

    const byId = new Map(memberships.map((m) => [m.workspaceId, m]));
    const requested = searchParams.workspace;
    const active =
        (requested && byId.get(requested)) || memberships[0] || null;

    if (!active) {
        return (
            <div className="space-y-6">
                <PageHeader />
                <Card className="p-8 text-center">
                    <p className="text-sm text-slate-500">
                        You aren&apos;t a member of any workspace yet.
                    </p>
                </Card>
            </div>
        );
    }

    const workspaceId = active.workspaceId;
    const canEdit = active.role === 'owner';

    const prompts = await db.prompt.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
    });

    const items: PromptListItem[] = prompts.map((p) => ({
        id: p.id,
        text: p.text,
        intent: p.intent,
        topic: p.topic,
        geography: p.geography,
        language: p.language,
        engines: p.engines,
        version: p.version,
        status: p.status,
        parentPromptId: p.parentPromptId,
        createdAt: p.createdAt.toISOString(),
    }));

    return (
        <div className="space-y-8">
            <PageHeader workspaceName={active.workspace.name} />
            <PromptsManager
                workspaceId={workspaceId}
                initialPrompts={items}
                canEdit={canEdit}
            />
        </div>
    );
}

function PageHeader({ workspaceName }: { workspaceName?: string }) {
    return (
        <header className="space-y-1">
            {workspaceName && (
                <p className="text-xs font-medium uppercase tracking-wider text-brand-700">
                    {workspaceName}
                </p>
            )}
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Prompts
            </h1>
            <p className="text-sm text-slate-500">
                The questions MeasureX asks AI engines to track your brand&apos;s visibility.
            </p>
        </header>
    );
}
