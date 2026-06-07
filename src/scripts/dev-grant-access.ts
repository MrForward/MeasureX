/**
 * Dev-only helper: grant the DEV_AUTH_BYPASS session user access to the seeded
 * workspace so the dashboard renders real data in the browser.
 *
 * The bypass session (src/lib/auth/config.ts) uses a fixed user id
 * `dev-bypass-user`, which isn't a member of any seeded workspace by default —
 * so /dashboard would show the empty "no workspace" state. This upserts that
 * user and an owner membership on the first (HubSpot) workspace. Idempotent.
 *
 * Run with:
 *   node --env-file=.env.local --import tsx src/scripts/dev-grant-access.ts
 */

import { db } from '@/lib/db';

const DEV_USER_ID = 'dev-bypass-user';

async function main() {
    const workspace = await db.workspace.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true },
    });
    if (!workspace) throw new Error('No workspace found — run `npm run db:seed` first.');

    await db.user.upsert({
        where: { id: DEV_USER_ID },
        update: {},
        create: {
            id: DEV_USER_ID,
            email: 'dev-bypass@localhost',
            name: 'Dev Admin',
        },
    });

    await db.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: DEV_USER_ID } },
        update: { role: 'owner' },
        create: { workspaceId: workspace.id, userId: DEV_USER_ID, role: 'owner' },
    });

    console.log(
        `✅ dev-bypass-user is now an owner of "${workspace.name}". ` +
            'Open http://localhost:3000/dashboard',
    );
    await db.$disconnect();
}

main().catch(async (err) => {
    console.error('dev-grant-access failed:', err);
    await db.$disconnect();
    process.exit(1);
});
