/**
 * Core job execution logic for processing a single AI engine execution.
 *
 * Separated from the route handler for testability. Orchestrates:
 *   1. Kill switch check
 *   2. Engine adapter lookup
 *   3. Circuit breaker check
 *   4. Rate limiting
 *   5. Prompt lookup
 *   6. Retry-wrapped engine execution
 *   7. Result storage (R2) and status updates
 *   8. Downstream job publishing (extraction pipeline)
 *
 * Validates: Requirement 4.7  (retry up to 3 times, then mark as failed)
 * Validates: Requirement 4.8  (continue processing remaining prompts on failure)
 * Validates: Requirement 18.1 (partial failure handling)
 * Validates: Requirement 20.5 (per-engine rate limiting)
 */

import type { ExecutionJobPayload } from '@/lib/queue/types';
import type { PromptInput, ExecutionContext } from '@/lib/engines/types';
import { EngineError } from '@/lib/engines/types';
import { engineRegistry } from '@/lib/engines/registry';
import { engineRateLimiterRegistry } from '@/lib/engines/rate-limiter';
import { executeWithRetry } from '@/lib/engines/retry';
import { storeRawResponse } from '@/lib/storage/r2';
import {
    createExecution,
    markExecutionSuccess,
    markExecutionFailed,
    markExecutionSkipped,
    incrementRunCounter,
} from '@/lib/engines/execution-store';
import { markRunInProgress, checkRunCompletion } from '@/lib/scheduler/run-lifecycle';
import { publishJob } from '@/lib/queue/qstash';
import { redis } from '@/lib/queue/redis';
import { db } from '@/lib/db';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExecuteJobResult {
    status: 'success' | 'failed' | 'skipped';
    executionId?: string;
    error?: string;
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Process a single execution job.
 *
 * Never throws — all errors are caught and returned as a result object.
 * This ensures the QStash webhook handler can always return 200 for
 * handled outcomes.
 */
export async function executeJob(payload: ExecutionJobPayload): Promise<ExecuteJobResult> {
    const { runId, promptId, engine, workspaceId } = payload;

    // ── 1. Kill switch check ──────────────────────────────────────────────────
    try {
        const killSwitch = await redis.get<boolean>('platform:kill_switch');
        if (killSwitch === true) {
            return { status: 'skipped', error: 'kill_switch_active' };
        }
    } catch {
        // Redis unavailable — fail open (continue processing)
    }

    // ── 2. Engine adapter lookup ──────────────────────────────────────────────
    const adapter = engineRegistry.find(engine);
    if (!adapter) {
        return { status: 'failed', error: 'engine_not_registered' };
    }

    // ── 3. Circuit breaker check ──────────────────────────────────────────────
    const status = adapter.getStatus();
    if (status.circuitBreakerOpen) {
        // Create execution record and mark as skipped
        const executionId = await createExecution({ runId, promptId, engine, workspaceId });
        await markRunInProgress(runId);
        await markExecutionSkipped(executionId, 'circuit_breaker_open');
        await incrementRunCounter(runId, 'skipped');
        await checkRunCompletion(runId);
        return { status: 'skipped', executionId, error: 'circuit_breaker_open' };
    }

    // ── 4. Rate limiting ──────────────────────────────────────────────────────
    const rateLimits = adapter.getRateLimits();
    await engineRateLimiterRegistry.waitAndProceed(engine, rateLimits);

    // ── 5. Build PromptInput from DB ──────────────────────────────────────────
    const prompt = await db.prompt.findUnique({
        where: { id: promptId },
        select: { text: true, language: true, geography: true },
    });

    if (!prompt) {
        return { status: 'failed', error: 'prompt_not_found' };
    }

    const promptInput: PromptInput = {
        text: prompt.text,
        language: prompt.language,
        geography: prompt.geography,
        promptId,
        workspaceId,
    };

    // ── 6. Create execution record ────────────────────────────────────────────
    const executionId = await createExecution({ runId, promptId, engine, workspaceId });

    // ── 6a. Transition run to in_progress (idempotent) ────────────────────────
    await markRunInProgress(runId);

    // ── 7. Build ExecutionContext ─────────────────────────────────────────────
    const context: ExecutionContext = {
        runId,
        promptId,
        workspaceId,
        executionId,
        attemptNumber: 1, // executeWithRetry manages attempt numbers internally
    };

    // ── 8. Execute with retry ─────────────────────────────────────────────────
    try {
        const result = await executeWithRetry(adapter, promptInput, context);

        if (!result.success) {
            // Circuit-blocked result from retry logic
            await markExecutionSkipped(executionId, result.error.message);
            await incrementRunCounter(runId, 'skipped');
            await checkRunCompletion(runId);
            return { status: 'skipped', executionId, error: result.error.message };
        }

        // ── 9. Success path ───────────────────────────────────────────────────
        const { response } = result;

        // Store raw response to R2
        const storageResult = await storeRawResponse({
            executionId,
            workspaceId,
            engine,
            response,
        });

        // Mark execution as success
        await markExecutionSuccess(
            executionId,
            response,
            storageResult.objectKey,
            storageResult.checksum,
        );

        // Increment run's successful counter
        await incrementRunCounter(runId, 'successful');

        // Check if all executions are done — finalize run if so
        await checkRunCompletion(runId);

        // Publish extraction job
        await publishJob('extract', { executionId, workspaceId });

        return { status: 'success', executionId };
    } catch (err) {
        // ── 10. Failure path (all retries exhausted) ──────────────────────────
        if (err instanceof EngineError) {
            await markExecutionFailed(executionId, err, err.retryable ? 3 : 1);
            await incrementRunCounter(runId, 'failed');
            await checkRunCompletion(runId);
            return { status: 'failed', executionId, error: err.message };
        }

        // Unexpected error — still mark as failed
        const engineError = new EngineError(
            err instanceof Error ? err.message : 'Unknown error',
            engine,
            'unknown',
            false,
        );
        await markExecutionFailed(executionId, engineError, 0);
        await incrementRunCounter(runId, 'failed');
        await checkRunCompletion(runId);
        return { status: 'failed', executionId, error: engineError.message };
    }
}
