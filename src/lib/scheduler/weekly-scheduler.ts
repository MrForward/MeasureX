/**
 * Weekly scheduler — creates Run records and queues ExecutionJobs for all
 * active workspaces on a weekly cadence.
 *
 * Validates: Requirement 4.1  (weekly scheduled runs)
 * Validates: Requirement 20.4 (distribute runs across the week)
 *
 * Idempotency: The unique constraint [workspaceId, week, type] on the runs
 * table prevents duplicate runs. If the cron fires twice in the same week,
 * the second invocation will skip workspaces that already have a run.
 */

import { db } from '@/lib/db';
import { publishJob } from '@/lib/queue/qstash';
import { createExecution } from '@/lib/engines/execution-store';
import { config } from '@/lib/config';
import { distributeWorkspaces } from '@/lib/scheduler/distribution';
import type { EngineId } from '@/types';
import type { ExecutionJobPayload } from '@/lib/queue/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScheduleResult {
    week: string;
    scheduled: number;
    skipped: number;
    errors: string[];
}

// ── ISO Week Calculation ──────────────────────────────────────────────────────

/**
 * Get the current ISO 8601 week string (e.g. "2024-W03").
 *
 * Uses the standard algorithm: the week containing the year's first Thursday
 * is week 1.
 */
export function getCurrentISOWeek(date: Date = new Date()): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    // Set to nearest Thursday: current date + 4 - current day number (Mon=1, Sun=7)
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);

    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);

    return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// ── Schedule All Workspaces ───────────────────────────────────────────────────

/**
 * Schedule runs for ALL active (non-deleted) workspaces.
 *
 * 1. Check platform kill switch — if active, return immediately
 * 2. Get current ISO week
 * 3. Query all active workspaces
 * 4. Distribute workspaces across the time window (avoid simultaneous execution)
 * 5. For each workspace: call scheduleWorkspaceRun with its assigned delay
 * 6. Collect results
 */
export async function scheduleWeeklyRuns(): Promise<ScheduleResult> {
    const killSwitch = await config.get<boolean>('platform.kill_switch', false);
    const week = getCurrentISOWeek();

    if (killSwitch) {
        return { week, scheduled: 0, skipped: 0, errors: [] };
    }

    const workspaces = await db.workspace.findMany({
        where: { deletedAt: null },
        select: { id: true },
    });

    // Distribute workspaces across the time window to avoid simultaneous execution
    const workspaceIds = workspaces.map((w) => w.id);
    const distributed = distributeWorkspaces(workspaceIds);

    let scheduled = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const entry of distributed) {
        try {
            const runId = await scheduleWorkspaceRun(entry.workspaceId, week, entry.delayMs);
            if (runId) {
                scheduled++;
            } else {
                skipped++;
            }
        } catch {
            errors.push(entry.workspaceId);
        }
    }

    return { week, scheduled, skipped, errors };
}

// ── Schedule Single Workspace ─────────────────────────────────────────────────

/**
 * Schedule a run for a SINGLE workspace (idempotent).
 *
 * Returns the run ID if a new run was created, or null if already scheduled
 * for this week (idempotent skip).
 *
 * @param workspaceId - The workspace to schedule
 * @param week        - ISO week string (e.g. "2024-W03")
 * @param delayMs     - Delay in milliseconds before jobs should execute (for distribution)
 */
export async function scheduleWorkspaceRun(
    workspaceId: string,
    week: string,
    delayMs: number = 0,
): Promise<string | null> {
    // 1. Check idempotency — does a run already exist for this workspace + week + type?
    const existing = await db.run.findUnique({
        where: {
            workspaceId_week_type: {
                workspaceId,
                week,
                type: 'scheduled',
            },
        },
    });

    if (existing) {
        return null;
    }

    // 2. Get all active prompts for this workspace
    const prompts = await db.prompt.findMany({
        where: {
            workspaceId,
            status: 'active',
        },
        select: { id: true, engines: true },
    });

    // 3. No active prompts — skip (no point running)
    if (prompts.length === 0) {
        return null;
    }

    // 4. Create the Run record
    const run = await db.run.create({
        data: {
            workspaceId,
            type: 'scheduled',
            status: 'queued',
            week,
        },
    });

    // 5. Create Execution records for each prompt × engine
    let totalExecutions = 0;
    const jobPayloads: ExecutionJobPayload[] = [];

    for (const prompt of prompts) {
        for (const engine of prompt.engines) {
            const executionId = await createExecution({
                runId: run.id,
                promptId: prompt.id,
                engine: engine as EngineId,
                workspaceId,
            });

            jobPayloads.push({
                runId: run.id,
                promptId: prompt.id,
                engine: engine as EngineId,
                workspaceId,
            });

            totalExecutions++;
        }
    }

    // 6. Update run's totalExecutions count
    await db.run.update({
        where: { id: run.id },
        data: { totalExecutions },
    });

    // 7. Publish execution jobs to QStash with distribution delay
    const delaySeconds = Math.ceil(delayMs / 1000);
    for (const payload of jobPayloads) {
        await publishJob('execute', payload, delaySeconds);
    }

    return run.id;
}
