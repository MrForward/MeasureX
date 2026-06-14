/**
 * DB-backed scan runner (PRD §F4 + §F6 + §F9).
 *
 * Thin wrapper around the pure {@link orchestrateScan}:
 *   1. Loads the brand, competitors, and active prompts.
 *   2. Creates a `Scan` (status "running") with the previous score for delta.
 *   3. Runs the prompt × engine grid, persisting each `EngineRun` + `Extraction`
 *      incrementally (so progress is observable) and bumping the run counters.
 *   4. Finalizes the `Scan` with overall score, per-engine scores, delta, status.
 *
 * Engine selection: real OpenAI/Perplexity runners, OR a deterministic demo
 * runner when `DEMO_MODE=true` (or a key is missing) so a scan can complete
 * locally without credits. Callers may also inject `runEngine` directly.
 */

import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { runChatGPT } from '@/lib/engines/runners/chatgpt';
import { runPerplexity } from '@/lib/engines/runners/perplexity';
import type { EngineId, EngineRunResult } from '@/lib/engines/runners/types';
import type { ExtractionEntity } from '@/lib/extraction/types';
import {
    orchestrateScan,
    type RunEngineFn,
    type OrchestrateScanResult,
} from './orchestrate';
import { summarizeForEmail, sendScanEmail } from '@/lib/notifications/scan-email';
import { appUrl } from '@/lib/stripe/client';

export interface RunScanOptions {
    /** Engines to run, in order. Default ['chatgpt', 'perplexity']. */
    engines?: EngineId[];
    /** Inject a custom engine runner (tests / demo). Overrides auto-selection. */
    runEngine?: RunEngineFn;
}

export interface RunScanResult extends OrchestrateScanResult {
    scanId: string;
}

const DEFAULT_ENGINES: EngineId[] = ['chatgpt', 'perplexity'];

/** True when demo mode is on (no real engine calls). */
export function isDemoMode(): boolean {
    return process.env.DEMO_MODE === 'true';
}

interface ScanContext {
    brandEntity: ExtractionEntity;
    competitors: ExtractionEntity[];
    prompts: Array<{ id: string; text: string }>;
    previousScore: number | null;
    engines: EngineId[];
    runEngine: RunEngineFn;
    /** Recipient for the scan-completion email (PRD §F10), or null. */
    userEmail: string | null;
}

/**
 * Load everything needed to run a scan: brand entity, competitors, active
 * prompts, the previous score (for delta), and the engine runner.
 *
 * @throws if the brand does not exist or has no active prompts.
 */
async function loadScanContext(
    brandId: string,
    opts: RunScanOptions,
): Promise<ScanContext> {
    const brand = await db.brand.findUnique({
        where: { id: brandId },
        include: {
            competitors: true,
            prompts: { where: { active: true } },
            user: { select: { email: true } },
        },
    });

    if (!brand) {
        throw new Error(`Brand not found: ${brandId}`);
    }
    if (brand.prompts.length === 0) {
        throw new Error(`Brand ${brandId} has no active prompts to scan`);
    }

    const brandEntity: ExtractionEntity = {
        id: brand.id,
        name: brand.name,
        domain: brand.domain,
    };
    const competitors: ExtractionEntity[] = brand.competitors.map((c) => ({
        id: c.id,
        name: c.name,
        domain: c.domain,
    }));

    // Previous score for delta (most recent finalized scan).
    const previous = await db.scan.findFirst({
        where: { brandId, status: { in: ['completed', 'partial'] }, overallScore: { not: null } },
        orderBy: { startedAt: 'desc' },
        select: { overallScore: true },
    });

    return {
        brandEntity,
        competitors,
        prompts: brand.prompts.map((p) => ({ id: p.id, text: p.text })),
        previousScore: previous?.overallScore ?? null,
        engines: opts.engines ?? DEFAULT_ENGINES,
        runEngine: opts.runEngine ?? buildRunEngine(brandEntity, competitors),
        userEmail: brand.user?.email ?? null,
    };
}

/** Create the `Scan` row in "running" state and return its id. */
async function createScanRow(brandId: string, ctx: ScanContext): Promise<string> {
    const scan = await db.scan.create({
        data: {
            brandId,
            status: 'running',
            totalPrompts: ctx.prompts.length,
            previousScore: ctx.previousScore,
        },
    });
    return scan.id;
}

/**
 * Run the orchestration for an existing scan, persisting each run + extraction
 * and finalizing the scan. On error the scan is marked "failed" and the error
 * re-thrown.
 */
async function executeScan(
    scanId: string,
    ctx: ScanContext,
): Promise<OrchestrateScanResult> {
    try {
        const result = await orchestrateScan({
            brand: ctx.brandEntity,
            competitors: ctx.competitors,
            prompts: ctx.prompts,
            engines: ctx.engines,
            previousScore: ctx.previousScore,
            runEngine: ctx.runEngine,
            onRun: async (record) => {
                const run = await db.engineRun.create({
                    data: {
                        scanId,
                        promptId: record.promptId,
                        engine: record.engine,
                        model: record.result.model,
                        status: record.result.status,
                        rawResponse: record.result.rawResponse,
                        nativeCitations: record.result.nativeCitations ?? undefined,
                        tokensUsed: record.result.tokensUsed ?? undefined,
                        errorMessage: record.result.errorMessage ?? undefined,
                    },
                });

                if (record.extraction) {
                    const e = record.extraction;
                    await db.extraction.create({
                        data: {
                            runId: run.id,
                            brandMentioned: e.brandMentioned,
                            brandPosition: e.brandPosition ?? undefined,
                            brandMentionCount: e.brandMentionCount,
                            brandRecommendation: e.brandRecommendation,
                            competitorResults: e.competitorResults as unknown as Prisma.InputJsonValue,
                            citations: e.citations as unknown as Prisma.InputJsonValue,
                            promptScore: e.promptScore,
                        },
                    });
                }

                await db.scan.update({
                    where: { id: scanId },
                    data:
                        record.result.status === 'completed'
                            ? { completedRuns: { increment: 1 } }
                            : { failedRuns: { increment: 1 } },
                });
            },
        });

        await db.scan.update({
            where: { id: scanId },
            data: {
                status: result.status,
                overallScore: result.overallScore,
                delta: result.delta,
                engineScores: result.engineScores,
                completedAt: new Date(),
            },
        });

        // Scan-completion email (PRD §F10) — fire-and-forget; never blocks/throws.
        if (ctx.userEmail && result.status !== 'failed') {
            const { mentionedPrompts, competitorGap } = summarizeForEmail(
                result.records,
                ctx.competitors,
            );
            void sendScanEmail({
                to: ctx.userEmail,
                score: result.overallScore,
                delta: result.delta,
                mentionedPrompts,
                totalPrompts: ctx.prompts.length,
                engineCount: ctx.engines.length,
                competitorGap,
                dashboardUrl: `${appUrl()}/dashboard`,
            }).catch(() => {});
        }

        return result;
    } catch (err) {
        await db.scan.update({
            where: { id: scanId },
            data: { status: 'failed', completedAt: new Date() },
        });
        throw err;
    }
}

/**
 * Run a full scan for a brand and persist all results, AWAITING completion.
 * Used by tests and the dev script.
 *
 * @throws if the brand does not exist or has no active prompts.
 */
export async function runScan(
    brandId: string,
    opts: RunScanOptions = {},
): Promise<RunScanResult> {
    const ctx = await loadScanContext(brandId, opts);
    const scanId = await createScanRow(brandId, ctx);
    const result = await executeScan(scanId, ctx);
    return { scanId, ...result };
}

export interface StartScanResult {
    scanId: string;
    totalPrompts: number;
}

/**
 * Start a scan and return immediately with its id, running the (2-4 minute)
 * orchestration in the background (in-process, NO job queue — PRD §F4 / CLAUDE.md).
 * The client polls `GET /api/scan/status` for progress.
 *
 * @throws (synchronously, before returning) if the brand is missing or has no
 *         active prompts; the long-running execution cannot throw to the caller.
 */
export async function startScan(
    brandId: string,
    opts: RunScanOptions = {},
): Promise<StartScanResult> {
    const ctx = await loadScanContext(brandId, opts);
    const scanId = await createScanRow(brandId, ctx);

    // Fire-and-forget: executeScan persists a terminal "failed" status on error,
    // so swallowing the rejection here cannot hide the outcome from the client.
    void executeScan(scanId, ctx).catch(() => {});

    return { scanId, totalPrompts: ctx.prompts.length };
}

// ── Engine selection ──────────────────────────────────────────────────────────

/** Pick the demo or real engine runner based on environment. */
export function buildRunEngine(
    brand: ExtractionEntity,
    competitors: ExtractionEntity[],
): RunEngineFn {
    if (isDemoMode()) {
        return demoRunEngine(brand, competitors);
    }
    return realRunEngine();
}

/** Real runner: dispatches to the OpenAI / Perplexity SDK callers. */
export function realRunEngine(): RunEngineFn {
    return (engine, prompt) =>
        engine === 'chatgpt' ? runChatGPT(prompt.text) : runPerplexity(prompt.text);
}

// ── Demo runner ───────────────────────────────────────────────────────────────

/** Stable non-cryptographic hash → non-negative integer. */
function stableHash(text: string): number {
    let h = 0;
    for (let i = 0; i < text.length; i += 1) {
        h = (h * 31 + text.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

/**
 * Deterministic demo runner. Produces brand-aware canned responses that span the
 * full 0-4 score range so the pipeline yields a realistic, non-trivial score
 * without spending credits. Same (prompt, engine) → same response.
 */
export function demoRunEngine(
    brand: ExtractionEntity,
    competitors: ExtractionEntity[],
): RunEngineFn {
    const c0 = competitors[0]?.name ?? 'Competitor A';
    const c1 = competitors[1]?.name ?? 'Competitor B';

    return async (engine, prompt): Promise<EngineRunResult> => {
        const variant = stableHash(`${prompt.text}|${engine}`) % 4;
        const model = engine === 'chatgpt' ? 'demo-gpt-4o-mini' : 'demo-sonar';

        let rawResponse: string;
        const citations: string[] = [];

        switch (variant) {
            case 0: // brand absent
                rawResponse = `${c0} and ${c1} are popular choices in this category.`;
                break;
            case 1: // mentioned (after a competitor)
                rawResponse = `${c0} is well known, and ${brand.name} is also worth considering.`;
                break;
            case 2: // cited (brand domain URL present)
                rawResponse = `${brand.name} publishes useful resources at https://${brand.domain}. ${c0} is an alternative.`;
                citations.push(`https://${brand.domain}/`);
                break;
            default: // recommended + first
                rawResponse = `I recommend ${brand.name} as the best option for most teams. ${c0} is also decent.`;
                break;
        }

        return {
            engine,
            model,
            status: 'completed',
            rawResponse,
            nativeCitations: engine === 'perplexity' ? citations : [],
            tokensUsed: 100 + variant,
            errorMessage: null,
        };
    };
}
