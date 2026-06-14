/**
 * Dashboard view-model assembly (PRD §F7).
 *
 * Pure transform from a persisted scan (+ brand/competitors) into the shape the
 * dashboard renders: score overview, prompt-result rows, and competitor cards.
 * Used by both the server page (initial render) and `/api/scan/latest` (the
 * client's poll refresh) so the two never drift.
 *
 * Competitor scores reuse the single-source-of-truth formula from
 * `metrics/competitor-score` — never reimplemented here.
 */

import {
    computeCompetitorScore,
    countCompetitorGaps,
    type CompetitorPromptSignals,
} from '@/lib/metrics/competitor-score';
import type {
    CompetitorResult,
    CitationResult,
    RecommendationStrength,
} from '@/lib/extraction/types';

export interface DashboardBrand {
    name: string;
    domain: string;
}
export interface DashboardCompetitor {
    id: string;
    name: string;
    domain: string;
}

/** Raw run as loaded from Prisma (extraction JSON columns are untyped). */
export interface RawRun {
    id: string;
    engine: string;
    status: string;
    prompt: { id: string; text: string; category: string };
    extraction: {
        brandMentioned: boolean;
        brandPosition: number | null;
        brandRecommendation: string;
        promptScore: number;
        competitorResults: unknown;
        citations: unknown;
    } | null;
}

export interface RawScan {
    id: string;
    status: string;
    overallScore: number | null;
    delta: number | null;
    engineScores: unknown;
    totalPrompts: number;
    completedRuns: number;
    failedRuns: number;
    startedAt: Date | string;
    completedAt: Date | string | null;
    runs: RawRun[];
}

export interface PromptRow {
    runId: string;
    promptId: string;
    promptText: string;
    category: string;
    engine: string;
    status: string;
    brandMentioned: boolean;
    brandPosition: number | null;
    brandRecommendation: RecommendationStrength;
    score: number | null;
    /** competitorId → mentioned in this run. */
    competitorMentioned: Record<string, boolean>;
}

export interface CompetitorCard {
    competitorId: string;
    name: string;
    domain: string;
    score: number;
    /** Prompt-engine runs where this competitor appears but the brand does not. */
    gapCount: number;
    mentionedCount: number;
    totalRuns: number;
}

export interface DashboardScan {
    id: string;
    status: string;
    overallScore: number | null;
    delta: number | null;
    engineScores: Record<string, number> | null;
    totalPrompts: number;
    completedRuns: number;
    failedRuns: number;
    startedAt: string;
    completedAt: string | null;
}

export interface DashboardData {
    brand: DashboardBrand;
    competitors: DashboardCompetitor[];
    scan: DashboardScan | null;
    rows: PromptRow[];
    competitorCards: CompetitorCard[];
}

function asArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
}

function toIso(value: Date | string | null): string | null {
    if (value === null) return null;
    return typeof value === 'string' ? value : value.toISOString();
}

export function buildDashboardData(
    scan: RawScan | null,
    brand: DashboardBrand,
    competitors: DashboardCompetitor[],
): DashboardData {
    if (!scan) {
        return { brand, competitors, scan: null, rows: [], competitorCards: [] };
    }

    const rows: PromptRow[] = scan.runs.map((run) => {
        const ext = run.extraction;
        const competitorResults = asArray<CompetitorResult>(ext?.competitorResults);
        const competitorMentioned: Record<string, boolean> = {};
        for (const c of competitors) {
            competitorMentioned[c.id] =
                competitorResults.find((cr) => cr.competitorId === c.id)?.mentioned ?? false;
        }

        return {
            runId: run.id,
            promptId: run.prompt.id,
            promptText: run.prompt.text,
            category: run.prompt.category,
            engine: run.engine,
            status: run.status,
            brandMentioned: ext?.brandMentioned ?? false,
            brandPosition: ext?.brandPosition ?? null,
            brandRecommendation: (ext?.brandRecommendation as RecommendationStrength) ?? 'ABSENT',
            score: ext ? ext.promptScore : null,
            competitorMentioned,
        };
    });

    // Completed runs drive scoring (failed runs have no extraction).
    const completed = scan.runs.filter((r) => r.extraction !== null);

    const competitorCards: CompetitorCard[] = competitors.map((competitor) => {
        const signals: CompetitorPromptSignals[] = completed.map((run) => {
            const ext = run.extraction!;
            const results = asArray<CompetitorResult>(ext.competitorResults);
            const citations = asArray<CitationResult>(ext.citations);
            const cr = results.find((r) => r.competitorId === competitor.id);
            return {
                mentioned: cr?.mentioned ?? false,
                cited: citations.some(
                    (c) => c.classification === 'competitor' && c.competitorName === competitor.name,
                ),
                recommended: cr?.recommendation === 'RECOMMENDED',
                beforeAllOthers: cr?.position === 1,
            };
        });

        const competitorMentions = completed.map((run) => {
            const results = asArray<CompetitorResult>(run.extraction!.competitorResults);
            return results.find((r) => r.competitorId === competitor.id)?.mentioned ?? false;
        });
        const brandMentions = completed.map((run) => run.extraction!.brandMentioned);

        return {
            competitorId: competitor.id,
            name: competitor.name,
            domain: competitor.domain,
            score: computeCompetitorScore(signals),
            gapCount: countCompetitorGaps(competitorMentions, brandMentions),
            mentionedCount: competitorMentions.filter(Boolean).length,
            totalRuns: completed.length,
        };
    });

    const dashboardScan: DashboardScan = {
        id: scan.id,
        status: scan.status,
        overallScore: scan.overallScore,
        delta: scan.delta,
        engineScores:
            scan.engineScores && typeof scan.engineScores === 'object'
                ? (scan.engineScores as Record<string, number>)
                : null,
        totalPrompts: scan.totalPrompts,
        completedRuns: scan.completedRuns,
        failedRuns: scan.failedRuns,
        startedAt: toIso(scan.startedAt) ?? '',
        completedAt: toIso(scan.completedAt),
    };

    return { brand, competitors, scan: dashboardScan, rows, competitorCards };
}
