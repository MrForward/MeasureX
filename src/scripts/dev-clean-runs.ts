/**
 * Dev-only helper: delete all runs (and their cascaded executions, extractions,
 * metrics) for the seeded workspace, so a fresh run can be validated cleanly.
 *
 *   node --env-file=.env.local --import tsx src/scripts/dev-clean-runs.ts
 */
import { db } from '@/lib/db';

async function main() {
    const ws = await db.workspace.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true },
    });
    if (!ws) throw new Error('No workspace found.');

    const del = await db.run.deleteMany({ where: { workspaceId: ws.id } });
    console.log(`🧹 Deleted ${del.count} run(s) (with cascaded data) for "${ws.name}".`);
    await db.$disconnect();
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
