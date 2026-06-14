/**
 * Dev helper — run a full scan end-to-end against the database.
 *
 * Seeds a demo brand (idempotent) if none exists, then runs a scan via the
 * orchestrator and prints a summary. Intended for DEMO_MODE so no API keys or
 * credits are needed.
 *
 * Usage:
 *   node --env-file=.env.local --import tsx src/scripts/dev-run-scan.ts [brandId]
 *
 * (Prisma CLI / tsx do not auto-read .env.local — pass --env-file.)
 */

import { db } from '@/lib/db';
import { runScan } from '@/lib/scan/run-scan';

const DEMO_EMAIL = 'dev-demo@measurex.local';

async function ensureBrand(): Promise<string> {
    const existing = await db.brand.findFirst({ select: { id: true } });
    if (existing) {
        return existing.id;
    }

    console.log('No brand found — seeding a demo brand…');
    const user = await db.user.upsert({
        where: { email: DEMO_EMAIL },
        update: {},
        create: { email: DEMO_EMAIL, name: 'Dev Demo', subscriptionStatus: 'active' },
    });

    const brand = await db.brand.create({
        data: {
            userId: user.id,
            name: 'MeasureX',
            domain: 'measurex.io',
            competitors: {
                create: [
                    { name: 'Otterly', domain: 'otterly.ai' },
                    { name: 'Peec', domain: 'peec.ai' },
                ],
            },
            prompts: {
                create: [
                    { text: 'best AEO tracking tools 2026', category: 'category' },
                    { text: 'top AI brand monitoring software', category: 'category' },
                    { text: 'MeasureX vs Otterly', category: 'comparison' },
                    { text: 'which AEO tool for a B2B SaaS marketing team', category: 'buyer_intent' },
                ],
            },
        },
    });
    return brand.id;
}

async function main(): Promise<void> {
    const brandId = process.argv[2] ?? (await ensureBrand());
    console.log(`Running scan for brand ${brandId} (DEMO_MODE=${process.env.DEMO_MODE})…\n`);

    const result = await runScan(brandId);

    console.log('── Scan complete ─────────────────────────────');
    console.log(`scanId:        ${result.scanId}`);
    console.log(`status:        ${result.status}`);
    console.log(`overallScore:  ${result.overallScore}`);
    console.log(`delta:         ${result.delta ?? 'first scan'}`);
    console.log(`engineScores:  ${JSON.stringify(result.engineScores)}`);
    console.log(`runs:          ${result.completedRuns} completed / ${result.failedRuns} failed`);

    // Verify persistence: re-read the scan + a couple of runs from the DB.
    const persisted = await db.scan.findUnique({
        where: { id: result.scanId },
        include: {
            runs: {
                take: 2,
                include: { extraction: true, prompt: { select: { text: true } } },
            },
        },
    });
    console.log('\n── Persisted sample ──────────────────────────');
    console.log(`scan.overallScore in DB: ${persisted?.overallScore}`);
    for (const run of persisted?.runs ?? []) {
        console.log(
            `  [${run.engine}] "${run.prompt.text.slice(0, 40)}" → ` +
                `mentioned=${run.extraction?.brandMentioned} ` +
                `rec=${run.extraction?.brandRecommendation} ` +
                `score=${run.extraction?.promptScore}`,
        );
    }
}

main()
    .then(() => db.$disconnect())
    .catch(async (err) => {
        console.error('Scan failed:', err);
        await db.$disconnect();
        process.exit(1);
    });
