/**
 * Dev-only helper: clear the 24h manual-run cooldown by back-dating existing
 * manual runs, so "Run scan" can be triggered again during testing/demos.
 *
 * Run with:
 *   node --env-file=.env.local --import tsx src/scripts/dev-reset-cooldown.ts
 */

import { db } from '@/lib/db';

async function main() {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const result = await db.run.updateMany({
        where: { type: 'manual' },
        data: { createdAt: twoDaysAgo },
    });
    console.log(`✅ Back-dated ${result.count} manual run(s) — cooldown cleared.`);
    await db.$disconnect();
}

main().catch(async (err) => {
    console.error('reset failed:', err);
    await db.$disconnect();
    process.exit(1);
});
