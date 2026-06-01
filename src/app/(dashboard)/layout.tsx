import * as React from 'react';
import { requireAuth } from '@/lib/auth/utils';
import { db } from '@/lib/db';
import { Sidebar } from '@/components/dashboard/sidebar';
import type {
    DashboardUser,
    WorkspaceRole,
    WorkspaceSummary,
} from '@/components/dashboard/types';

/**
 * Dashboard layout — wraps every page under the (dashboard) route group.
 *
 * Responsibilities:
 * 1. Require authentication; unauth'd users are redirected to /login.
 * 2. Load the user's workspaces directly from the DB (server component).
 * 3. Render the Sidebar + main content shell.
 *
 * Active-workspace selection is intentionally simple at this layer: we
 * default to the first workspace returned by the DB. Per-page workspace
 * routing (e.g. /dashboard/[workspaceId]/...) is layered on by later tasks.
 */
export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await requireAuth();

    const userId = session.user?.id;
    if (!userId) {
        // Shouldn't happen — requireAuth() guarantees a session — but TS is strict.
        throw new Error('Authenticated session is missing user id');
    }

    const memberships = await db.workspaceMember.findMany({
        where: {
            userId,
            workspace: { deletedAt: null },
        },
        include: { workspace: true },
        orderBy: { createdAt: 'asc' },
    });

    const workspaces: WorkspaceSummary[] = memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        role: normalizeRole(m.role),
    }));

    const activeWorkspaceId = workspaces[0]?.id ?? null;

    const user: DashboardUser = {
        id: userId,
        email: session.user?.email ?? '',
        name: session.user?.name ?? null,
        image: session.user?.image ?? null,
    };

    return (
        <div className="flex min-h-screen bg-white">
            <Sidebar
                workspaces={workspaces}
                activeWorkspaceId={activeWorkspaceId}
                user={user}
            />
            <main className="flex-1 overflow-x-hidden">
                <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-8 md:py-10">
                    {children}
                </div>
            </main>
        </div>
    );
}

/**
 * Coerce the DB role string to our union. Anything unexpected falls back to
 * `viewer` — the safer default.
 */
function normalizeRole(role: string): WorkspaceRole {
    return role === 'owner' ? 'owner' : 'viewer';
}
