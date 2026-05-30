/**
 * Development data seeder for MeasureX.
 *
 * Creates test accounts, a HubSpot workspace with competitors, sample prompts,
 * and the default platform config. Run with: npm run db:seed
 *
 * Safe to run multiple times (idempotent upserts where possible).
 */

import { db } from '@/lib/db';
import { CONFIG_DEFAULTS } from '@/lib/config/defaults';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'aibrain.play@gmail.com';

async function seedPlatformConfig() {
    console.log('→ Seeding platform config defaults...');
    for (const [key, def] of Object.entries(CONFIG_DEFAULTS)) {
        await db.platformConfig.upsert({
            where: { key },
            update: {}, // Don't overwrite existing values on re-seed
            create: {
                key,
                value: def.value as object,
                description: def.description,
                category: def.category,
                updatedBy: 'seed',
            },
        });
    }
    console.log(`  ✓ ${Object.keys(CONFIG_DEFAULTS).length} config keys`);
}

async function seedUsers() {
    console.log('→ Seeding test users...');
    const admin = await db.user.upsert({
        where: { email: ADMIN_EMAIL },
        update: {},
        create: { email: ADMIN_EMAIL, name: 'MeasureX Admin', authProvider: 'email' },
    });
    const viewer = await db.user.upsert({
        where: { email: 'viewer@test.local' },
        update: {},
        create: { email: 'viewer@test.local', name: 'Test Viewer', authProvider: 'email' },
    });
    console.log('  ✓ admin + viewer');
    return { admin, viewer };
}

async function seedWorkspace(ownerId: string, viewerId: string) {
    console.log('→ Seeding HubSpot workspace...');

    const workspace = await db.workspace.create({
        data: {
            name: 'HubSpot',
            ownerId,
            plan: 'free',
            members: {
                create: [
                    { userId: ownerId, role: 'owner' },
                    { userId: viewerId, role: 'viewer' },
                ],
            },
        },
    });

    await db.brandProfile.create({
        data: {
            workspaceId: workspace.id,
            brandName: 'HubSpot',
            domain: 'hubspot.com',
            aliases: ['HubSpot', 'Hubspot', 'HubSpot CRM'],
            version: 1,
        },
    });

    const competitors = [
        { name: 'Salesforce', domain: 'salesforce.com', aliases: ['Salesforce', 'SFDC'] },
        { name: 'Zoho CRM', domain: 'zoho.com', aliases: ['Zoho', 'Zoho CRM'] },
        { name: 'Pipedrive', domain: 'pipedrive.com', aliases: ['Pipedrive'] },
        { name: 'Monday.com', domain: 'monday.com', aliases: ['Monday', 'monday.com'] },
        { name: 'ActiveCampaign', domain: 'activecampaign.com', aliases: ['ActiveCampaign'] },
    ];

    for (const c of competitors) {
        await db.competitor.create({ data: { workspaceId: workspace.id, ...c } });
    }
    console.log(`  ✓ workspace + brand + ${competitors.length} competitors`);

    const prompts = [
        { text: 'What is the best CRM for small businesses?', intent: 'commercial', topic: 'CRM selection' },
        { text: 'HubSpot vs Salesforce: which is better for startups?', intent: 'navigational', topic: 'comparison' },
        { text: 'What are the top marketing automation platforms?', intent: 'commercial', topic: 'marketing automation' },
        { text: 'How do I choose a CRM for my sales team?', intent: 'informational', topic: 'CRM selection' },
        { text: 'Best free CRM software in 2025', intent: 'transactional', topic: 'free CRM' },
    ];

    for (const p of prompts) {
        await db.prompt.create({
            data: {
                workspaceId: workspace.id,
                text: p.text,
                intent: p.intent,
                topic: p.topic,
                geography: 'US',
                language: 'en',
                engines: ['chatgpt', 'perplexity', 'google_ai'],
                status: 'active',
            },
        });
    }
    console.log(`  ✓ ${prompts.length} sample prompts`);

    return workspace;
}

async function main() {
    console.log('\n🌱 Seeding MeasureX dev data\n');
    await seedPlatformConfig();
    const { admin, viewer } = await seedUsers();
    await seedWorkspace(admin.id, viewer.id);
    console.log('\n✅ Seed complete\n');
    console.log(`   Admin:  ${ADMIN_EMAIL}`);
    console.log('   Viewer: viewer@test.local\n');
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(() => db.$disconnect());
