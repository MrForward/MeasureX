/**
 * Dev validation harness — drives a full demo run end-to-end IN-PROCESS.
 *
 * Runs the same orchestrators the route handlers call, in order:
 *   executeJob (demo fixture → store) → extractJob (runExtraction → persist)
 *   → computeRunMetrics (score → persist) → loadOverviewData (what the dashboard reads)
 *
 * This bypasses the HTTP/QStash hop (and its RBAC layer) so we can confirm the
 * pipeline produces real metric rows without a running server or auth setup.
 *
 * Run with:
 *   node --env-file=.env.local --import tsx src/scripts/dev-trigger-run.ts
 */

import { db } from '@/lib/db';
import { executeJob } from '@/lib/scheduler/execute-job';
import { extractJob } from '@/lib/extraction/extract-job';
import { computeRunMetrics } from '@/lib/metrics/compute-run-metrics';
import { loadOverviewData } from '@/lib/dashboard/overview';
import type { EngineId } from '@/types';

async function main() {
    if (process.env.DEMO_MODE !== 'true') {
        throw new Error('Set DEMO_MODE=true to run this validation harness for free.');
    }

    // 1. Find the seeded workspace + its active prompts.
    const workspace = await db.workspace.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true },
    });
    if (!workspace) throw new Error('No workspace found — run `npm run db:seed` first.');

    const prompts = await db.prompt.findMany({
        where: { workspaceId: workspace.id, status: 'active' },
        select: { id: true, text: true, engines: true },
    });
    console.log(`\n🏢 Workspace: ${workspace.name} (${prompts.length} active prompts)`);

    // 2. Create a manual run.
    const run = await db.run.create({
        data: { workspaceId: workspace.id, type: 'manual', status: 'queued' },
        select: { id: true },
    });
    console.log(`▶️  Run ${run.id} created\n`);

    // 3. Execute every prompt × engine (demo fixtures — no API credits).
    let executed = 0;
    for (const prompt of prompts) {
        for (const engine of prompt.engines as EngineId[]) {
            await executeJob({
                runId: run.id,
                promptId: prompt.id,
                engine,
                workspaceId: workspace.id,
            });
            executed++;
        }
    }
    console.log(`⚙️  Executed ${executed} prompt×engine jobs (demo mode)`);

    // 4. Extraction for each successful execution (route normally does this via
    //    the published 'extract' job; we call it directly to skip the HTTP hop).
    const successes = await db.execution.findMany({
        where: { runId: run.id, status: 'success' },
        select: { id: true },
    });
    for (const e of successes) {
        await extractJob(e.id, workspace.id);
    }
    console.log(`🔎 Extracted ${successes.length} responses`);

    // 5. Compute + persist metrics for the run.
    const metricCount = await computeRunMetrics(run.id, workspace.id);
    console.log(`📊 Persisted ${metricCount} metric rows\n`);

    // 6. Per-prompt-engine breakdown (what a drill-down would show).
    const metrics = await db.metric.findMany({
        where: { runId: run.id },
        select: { engine: true, visibilityScore: true, mentionCount: true, citationRate: true, promptId: true },
        orderBy: { visibilityScore: 'desc' },
    });
    console.log('   Visibility scores (per prompt × engine):');
    for (const m of metrics) {
        console.log(
            `   • ${(m.engine ?? 'n/a').padEnd(11)} score=${String(m.visibilityScore).padStart(3)}  ` +
                `mentions=${m.mentionCount}  citationRate=${m.citationRate}%`,
        );
    }

    // 7. The exact numbers the dashboard overview panel renders.
    const overview = await loadOverviewData(workspace.id);
    console.log('\n📈 Dashboard overview (what /dashboard will render):');
    console.log(`   hasData:         ${overview.hasData}`);
    console.log(`   Visibility:      ${overview.visibilityScore}/100`);
    console.log(`   Total mentions:  ${overview.totalMentions}`);
    console.log(`   Citation rate:   ${overview.citationRate}%`);
    console.log(`   Active prompts:  ${overview.totalPrompts}`);

    console.log(
        `\n${overview.hasData && metricCount > 0 ? '✅ PIPELINE GREEN — run produced real metrics end-to-end.' : '❌ Pipeline produced no metrics.'}\n`,
    );

    await db.$disconnect();
}

main().catch(async (err) => {
    console.error('Validation harness failed:', err);
    await db.$disconnect();
    process.exit(1);
});
