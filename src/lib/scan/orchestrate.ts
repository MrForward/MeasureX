/**
 * Scan orchestration core (PRD §F4 execution strategy + §F6 scoring).
 *
 * Pure, DB-free orchestration: given the brand/competitor config, the active
 * prompts, and an injected `runEngine`, it runs every prompt across every engine
 * SEQUENTIALLY (one prompt at a time across both engines, PRD §F4), feeds each
 * completed response through {@link runExtraction}, then aggregates the 0-4
 * prompt scores into an overall visibility score with delta (PRD §F6).
 *
 * Injecting `runEngine` (and the optional `onRun` hook) keeps this unit-testable
 * without network or database access — the DB-backed wrapper lives in
 * `run-scan.ts`.
 */

import { runExtraction } from '@/lib/extraction/run-extraction';
import { computeOverallScore } from '@/lib/metrics/visibility-score';
import { computeDelta } from '@/lib/metrics/change-detection';
import type { Extraction, ExtractionEntity } from '@/lib/extraction/types';
import type { EngineId, EngineRunResult } from '@/lib/engines/runners/types';

export interface ScanPrompt {
    id: string;
    text: string;
}

/** Runs one prompt against one engine. Must never throw (failures are results). */
export type RunEngineFn = (
    engine: EngineId,
    prompt: ScanPrompt,
) => Promise<EngineRunResult>;

/** One completed prompt-engine unit of work. */
export interface ScanRunRecord {
    promptId: string;
    engine: EngineId;
    result: EngineRunResult;
    /** Extraction for completed runs; null when the run failed. */
    extraction: Extraction | null;
}

export interface OrchestrateScanInput {
    brand: ExtractionEntity;
    competitors: ExtractionEntity[];
    prompts: ScanPrompt[];
    /** Engines to run, in order. Default ['chatgpt', 'perplexity']. */
    engines?: EngineId[];
    /** Previous scan's overall score, for delta. Null/omitted → first scan. */
    previousScore?: number | null;
    runEngine: RunEngineFn;
    /** Fired after each run completes — used for incremental persistence/progress. */
    onRun?: (
        record: ScanRunRecord,
        completed: number,
        total: number,
    ) => void | Promise<void>;
}

export interface OrchestrateScanResult {
    status: 'completed' | 'partial' | 'failed';
    overallScore: number;
    previousScore: number | null;
    delta: number | null;
    /** Per-engine 0-100 score, keyed by engine id. */
    engineScores: Record<string, number>;
    totalPrompts: number;
    totalRuns: number;
    completedRuns: number;
    failedRuns: number;
    records: ScanRunRecord[];
}

/** Run a full scan over the prompt × engine grid and score the results. */
export async function orchestrateScan(
    input: OrchestrateScanInput,
): Promise<OrchestrateScanResult> {
    const engines = input.engines ?? ['chatgpt', 'perplexity'];
    const totalRuns = input.prompts.length * engines.length;
    const records: ScanRunRecord[] = [];

    let completed = 0;

    // Sequential: one prompt at a time, across each engine (PRD §F4).
    for (const prompt of input.prompts) {
        for (const engine of engines) {
            const result = await input.runEngine(engine, prompt);

            const extraction =
                result.status === 'completed' && result.rawResponse !== null
                    ? runExtraction({
                          responseText: result.rawResponse,
                          nativeCitations: result.nativeCitations ?? undefined,
                          brand: input.brand,
                          competitors: input.competitors,
                      })
                    : null;

            const record: ScanRunRecord = { promptId: prompt.id, engine, result, extraction };
            records.push(record);

            completed += 1;
            if (input.onRun) {
                await input.onRun(record, completed, totalRuns);
            }
        }
    }

    // Score over COMPLETED runs only (PRD §F7 "results shown for completed prompts").
    const completedRecords = records.filter((r) => r.extraction !== null);
    const failedRuns = records.length - completedRecords.length;

    const overallScore = computeOverallScore(
        completedRecords.map((r) => r.extraction!.promptScore),
    );

    const engineScores: Record<string, number> = {};
    for (const engine of engines) {
        engineScores[engine] = computeOverallScore(
            completedRecords
                .filter((r) => r.engine === engine)
                .map((r) => r.extraction!.promptScore),
        );
    }

    const previousScore = input.previousScore ?? null;
    const delta = computeDelta(overallScore, previousScore);

    const status: OrchestrateScanResult['status'] =
        totalRuns === 0
            ? 'completed'
            : completedRecords.length === 0
              ? 'failed'
              : failedRuns > 0
                ? 'partial'
                : 'completed';

    return {
        status,
        overallScore,
        previousScore,
        delta,
        engineScores,
        totalPrompts: input.prompts.length,
        totalRuns,
        completedRuns: completedRecords.length,
        failedRuns,
        records,
    };
}
