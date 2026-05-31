/**
 * Execution record storage — data access layer for prompt-engine executions.
 *
 * Validates: Requirement 4.6  (store timestamp, engine, prompt, raw_response_ref,
 *                               status, model_version, error_details)
 * Validates: Requirement 19.1 (immutable audit trail — executions are never deleted)
 * Validates: Requirement 18.1 (partial failure handling — run continues when
 *                               individual executions fail)
 */

import { db } from '@/lib/db';
import type { Execution } from '@prisma/client';
import type { EngineId } from '@/types';
import type { StandardizedResponse } from './types';
import { EngineError } from './types';

// ── Parameter types ───────────────────────────────────────────────────────────

export interface CreateExecutionParams {
    runId: string;
    promptId: string;
    engine: EngineId;
    /** Used for cost tracking and rate limiting. */
    workspaceId: string;
}

// ── Execution CRUD ────────────────────────────────────────────────────────────

/**
 * Create a new execution record with status 'pending'.
 * Returns the new execution's ID.
 *
 * Validates: Requirement 4.6 (timestamp, engine, prompt, status stored at creation)
 */
export async function createExecution(params: CreateExecutionParams): Promise<string> {
    const execution = await db.execution.create({
        data: {
            runId: params.runId,
            promptId: params.promptId,
            engine: params.engine,
            status: 'pending',
        },
        select: { id: true },
    });

    return execution.id;
}

/**
 * Mark an execution as successful, storing the raw response reference,
 * checksum, model version, and execution time.
 *
 * Validates: Requirement 4.6  (raw_response_ref, model_version stored)
 * Validates: Requirement 19.1 (checksum stored for data integrity)
 */
export async function markExecutionSuccess(
    executionId: string,
    response: StandardizedResponse,
    rawResponseRef: string,
    checksum: string,
): Promise<void> {
    await db.execution.update({
        where: { id: executionId },
        data: {
            status: 'success',
            rawResponseRef,
            responseChecksum: checksum,
            modelVersion: response.modelVersion,
            executionTimeMs: response.executionTimeMs,
        },
    });
}

/**
 * Mark an execution as failed, storing error details and retry count.
 *
 * Validates: Requirement 4.6  (error_details stored)
 * Validates: Requirement 4.7  (retry count tracked)
 * Validates: Requirement 19.1 (immutable audit — record updated, never deleted)
 */
export async function markExecutionFailed(
    executionId: string,
    error: EngineError,
    retryCount: number,
): Promise<void> {
    const errorDetails = JSON.stringify({
        message: error.message,
        code: error.code,
        engineId: error.engineId,
        statusCode: error.statusCode ?? null,
        retryable: error.retryable,
    });

    await db.execution.update({
        where: { id: executionId },
        data: {
            status: 'failed',
            errorDetails,
            retryCount,
        },
    });
}

/**
 * Mark an execution as skipped (engine unavailable / circuit open).
 *
 * Validates: Requirement 18.1 (run continues when individual executions fail)
 */
export async function markExecutionSkipped(
    executionId: string,
    reason: string,
): Promise<void> {
    await db.execution.update({
        where: { id: executionId },
        data: {
            status: 'skipped',
            errorDetails: reason,
        },
    });
}

/**
 * Retrieve a single execution by ID.
 * Returns null if not found.
 */
export async function getExecution(executionId: string): Promise<Execution | null> {
    return db.execution.findUnique({
        where: { id: executionId },
    });
}

/**
 * Retrieve all executions belonging to a run.
 */
export async function getRunExecutions(runId: string): Promise<Execution[]> {
    return db.execution.findMany({
        where: { runId },
        orderBy: { createdAt: 'asc' },
    });
}

// ── Run status tracking ───────────────────────────────────────────────────────

/**
 * Atomically increment one of the run's counter fields
 * (successful / failed / skipped).
 *
 * Uses Prisma's atomic increment to avoid race conditions when multiple
 * executions complete concurrently.
 *
 * Validates: Requirement 18.1 (partial failure tracking per run)
 */
export async function incrementRunCounter(
    runId: string,
    field: 'successful' | 'failed' | 'skipped',
): Promise<void> {
    await db.run.update({
        where: { id: runId },
        data: {
            [field]: { increment: 1 },
        },
    });
}

/**
 * Finalize a run once all executions have completed.
 *
 * Status rules:
 *   - 'completed' — zero failures
 *   - 'partial'   — some failures but failure rate < 50 %
 *   - 'failed'    — failure rate >= 50 %
 *
 * Uses a transaction so the read and write are atomic.
 *
 * Validates: Requirement 18.1 (partial failure handling)
 * Validates: Requirement 19.1 (run completion recorded in audit trail)
 */
export async function finalizeRun(runId: string): Promise<void> {
    await db.$transaction(async (tx) => {
        const run = await tx.run.findUniqueOrThrow({
            where: { id: runId },
            select: { failed: true, successful: true, skipped: true },
        });

        const total = run.successful + run.failed + run.skipped;
        const failureRate = total > 0 ? run.failed / total : 0;

        let status: string;
        if (run.failed === 0) {
            status = 'completed';
        } else if (failureRate < 0.5) {
            status = 'partial';
        } else {
            status = 'failed';
        }

        await tx.run.update({
            where: { id: runId },
            data: {
                status,
                completedAt: new Date(),
            },
        });
    });
}
