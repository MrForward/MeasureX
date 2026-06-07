/**
 * Dev helper: print the status + downstream counts for a run.
 *   node --env-file=.env.local --import tsx src/scripts/dev-run-status.ts <runId>
 */
import { db } from '@/lib/db';

async function main() {
    const runId = process.argv[2];
    if (!runId) throw new Error('usage: dev-run-status <runId>');

    const run = await db.run.findUnique({ where: { id: runId } });
    const byStatus = await db.execution.groupBy({
        by: ['status'],
        where: { runId },
        _count: true,
    });
    const extractions = await db.extraction.count({ where: { execution: { runId } } });
    const metrics = await db.metric.count({ where: { runId } });

    console.log('run.status        :', run?.status);
    console.log('totalExecutions   :', run?.totalExecutions, '| ok:', run?.successful, 'failed:', run?.failed, 'skipped:', run?.skipped);
    console.log('executions byStatus:', byStatus.map((b) => `${b.status}=${b._count}`).join(' '));
    console.log('extractions       :', extractions);
    console.log('metrics           :', metrics);
    await db.$disconnect();
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
