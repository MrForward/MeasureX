/**
 * Unit tests for execute-job.ts
 *
 * Validates: Requirement 4.7  (retry up to 3 times, then mark as failed)
 * Validates: Requirement 4.8  (continue processing remaining prompts on failure)
 * Validates: Requirement 18.1 (partial failure handling)
 * Validates: Requirement 20.5 (per-engine rate limiting)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/queue/redis', () => ({
    redis: {
        get: vi.fn(),
    },
}));

vi.mock('@/lib/db', () => ({
    db: {
        prompt: {
            findUnique: vi.fn(),
        },
    },
}));

vi.mock('@/lib/engines/registry', () => ({
    engineRegistry: {
        find: vi.fn(),
    },
}));

vi.mock('@/lib/engines/rate-limiter', () => ({
    engineRateLimiterRegistry: {
        waitAndProceed: vi.fn(),
    },
}));

vi.mock('@/lib/engines/retry', () => ({
    executeWithRetry: vi.fn(),
}));

vi.mock('@/lib/storage/r2', () => ({
    storeRawResponse: vi.fn(),
}));

vi.mock('@/lib/engines/execution-store', () => ({
    createExecution: vi.fn(),
    markExecutionSuccess: vi.fn(),
    markExecutionFailed: vi.fn(),
    markExecutionSkipped: vi.fn(),
    incrementRunCounter: vi.fn(),
}));

vi.mock('@/lib/queue/qstash', () => ({
    publishJob: vi.fn(),
}));

vi.mock('@/lib/scheduler/run-lifecycle', () => ({
    markRunInProgress: vi.fn(),
    checkRunCompletion: vi.fn(),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { executeJob } from './execute-job';
import { redis } from '@/lib/queue/redis';
import { db } from '@/lib/db';
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
import { publishJob } from '@/lib/queue/qstash';
import { markRunInProgress, checkRunCompletion } from '@/lib/scheduler/run-lifecycle';
import { EngineError } from '@/lib/engines/types';
import type { ExecutionJobPayload } from '@/lib/queue/types';
import type { EngineAdapter, StandardizedResponse } from '@/lib/engines/types';

// ── Typed mock helpers ────────────────────────────────────────────────────────

const mockRedis = redis as unknown as { get: ReturnType<typeof vi.fn> };
const mockDb = db as unknown as { prompt: { findUnique: ReturnType<typeof vi.fn> } };
const mockRegistry = engineRegistry as unknown as { find: ReturnType<typeof vi.fn> };
const mockRateLimiter = engineRateLimiterRegistry as unknown as { waitAndProceed: ReturnType<typeof vi.fn> };
const mockExecuteWithRetry = executeWithRetry as ReturnType<typeof vi.fn>;
const mockStoreRawResponse = storeRawResponse as ReturnType<typeof vi.fn>;
const mockCreateExecution = createExecution as ReturnType<typeof vi.fn>;
const mockMarkSuccess = markExecutionSuccess as ReturnType<typeof vi.fn>;
const mockMarkFailed = markExecutionFailed as ReturnType<typeof vi.fn>;
const mockMarkSkipped = markExecutionSkipped as ReturnType<typeof vi.fn>;
const mockIncrementCounter = incrementRunCounter as ReturnType<typeof vi.fn>;
const mockPublishJob = publishJob as ReturnType<typeof vi.fn>;
const mockMarkRunInProgress = markRunInProgress as ReturnType<typeof vi.fn>;
const mockCheckRunCompletion = checkRunCompletion as ReturnType<typeof vi.fn>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PAYLOAD: ExecutionJobPayload = {
    runId: 'run-1',
    promptId: 'prompt-1',
    engine: 'chatgpt',
    workspaceId: 'ws-1',
};

const MOCK_RESPONSE: StandardizedResponse = {
    rawText: 'HubSpot is a leading CRM platform.',
    citations: [],
    metadata: {},
    modelVersion: 'gpt-4o-2024-05-13',
    timestamp: new Date('2024-01-01T00:00:00Z'),
    executionTimeMs: 350,
};

function createMockAdapter(overrides?: Partial<EngineAdapter>): EngineAdapter {
    return {
        engineId: 'chatgpt',
        engineName: 'ChatGPT',
        execute: vi.fn(),
        parseResponse: vi.fn(),
        getStatus: vi.fn().mockReturnValue({
            available: true,
            consecutiveFailures: 0,
            circuitBreakerOpen: false,
            lastSuccessAt: null,
            lastFailureAt: null,
            lastErrorMessage: null,
        }),
        getRateLimits: vi.fn().mockReturnValue({
            requestsPerMinute: 60,
            requestsPerDay: 5000,
            cooldownMs: 1000,
        }),
        getCostPerCall: vi.fn().mockReturnValue(0.003),
        ...overrides,
    };
}

/**
 * Sets up all mocks for a successful execution path.
 */
function setupSuccessPath() {
    mockRedis.get.mockResolvedValue(null);
    mockRegistry.find.mockReturnValue(createMockAdapter());
    mockRateLimiter.waitAndProceed.mockResolvedValue(0);
    mockDb.prompt.findUnique.mockResolvedValue({
        text: 'What is the best CRM?',
        language: 'en',
        geography: 'US',
    });
    mockCreateExecution.mockResolvedValue('exec-1');
    mockMarkRunInProgress.mockResolvedValue(undefined);
    mockExecuteWithRetry.mockResolvedValue({ success: true, response: MOCK_RESPONSE });
    mockStoreRawResponse.mockResolvedValue({ objectKey: 'responses/ws-1/chatgpt/exec-1.json', checksum: 'sha256-abc' });
    mockMarkSuccess.mockResolvedValue(undefined);
    mockIncrementCounter.mockResolvedValue(undefined);
    mockCheckRunCompletion.mockResolvedValue({ complete: false });
    mockPublishJob.mockResolvedValue(undefined);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('executeJob', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── Success path ──────────────────────────────────────────────────────────

    it('returns "success" when engine executes successfully', async () => {
        setupSuccessPath();

        const result = await executeJob(PAYLOAD);

        expect(result.status).toBe('success');
        expect(result.executionId).toBe('exec-1');
        expect(result.error).toBeUndefined();
    });

    it('stores raw response to R2 on success', async () => {
        setupSuccessPath();

        await executeJob(PAYLOAD);

        expect(mockStoreRawResponse).toHaveBeenCalledWith({
            executionId: 'exec-1',
            workspaceId: 'ws-1',
            engine: 'chatgpt',
            response: MOCK_RESPONSE,
        });
    });

    it('marks execution as success on success', async () => {
        setupSuccessPath();

        await executeJob(PAYLOAD);

        expect(mockMarkSuccess).toHaveBeenCalledWith(
            'exec-1',
            MOCK_RESPONSE,
            'responses/ws-1/chatgpt/exec-1.json',
            'sha256-abc',
        );
    });

    it('increments the "successful" run counter on success', async () => {
        setupSuccessPath();

        await executeJob(PAYLOAD);

        expect(mockIncrementCounter).toHaveBeenCalledWith('run-1', 'successful');
    });

    it('publishes extraction job on success', async () => {
        setupSuccessPath();

        await executeJob(PAYLOAD);

        expect(mockPublishJob).toHaveBeenCalledWith('extract', {
            executionId: 'exec-1',
            workspaceId: 'ws-1',
        });
    });

    // ── Kill switch ───────────────────────────────────────────────────────────

    it('returns "skipped" when kill switch is active', async () => {
        mockRedis.get.mockResolvedValue(true);

        const result = await executeJob(PAYLOAD);

        expect(result.status).toBe('skipped');
        expect(result.error).toBe('kill_switch_active');
    });

    // ── Engine not registered ─────────────────────────────────────────────────

    it('returns "failed" when engine is not registered', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockRegistry.find.mockReturnValue(null);

        const result = await executeJob(PAYLOAD);

        expect(result.status).toBe('failed');
        expect(result.error).toBe('engine_not_registered');
    });

    // ── Circuit breaker open ──────────────────────────────────────────────────

    it('returns "skipped" when circuit breaker is open', async () => {
        mockRedis.get.mockResolvedValue(null);
        const adapter = createMockAdapter({
            getStatus: vi.fn().mockReturnValue({
                available: false,
                consecutiveFailures: 5,
                circuitBreakerOpen: true,
                lastSuccessAt: null,
                lastFailureAt: new Date(),
                lastErrorMessage: 'timeout',
            }),
        });
        mockRegistry.find.mockReturnValue(adapter);
        mockCreateExecution.mockResolvedValue('exec-2');
        mockMarkSkipped.mockResolvedValue(undefined);
        mockIncrementCounter.mockResolvedValue(undefined);

        const result = await executeJob(PAYLOAD);

        expect(result.status).toBe('skipped');
        expect(result.executionId).toBe('exec-2');
        expect(result.error).toBe('circuit_breaker_open');
    });

    it('marks execution as skipped when circuit breaker is open', async () => {
        mockRedis.get.mockResolvedValue(null);
        const adapter = createMockAdapter({
            getStatus: vi.fn().mockReturnValue({
                available: false,
                consecutiveFailures: 5,
                circuitBreakerOpen: true,
                lastSuccessAt: null,
                lastFailureAt: new Date(),
                lastErrorMessage: 'timeout',
            }),
        });
        mockRegistry.find.mockReturnValue(adapter);
        mockCreateExecution.mockResolvedValue('exec-2');
        mockMarkSkipped.mockResolvedValue(undefined);
        mockIncrementCounter.mockResolvedValue(undefined);

        await executeJob(PAYLOAD);

        expect(mockMarkSkipped).toHaveBeenCalledWith('exec-2', 'circuit_breaker_open');
    });

    it('increments the "skipped" run counter when circuit breaker is open', async () => {
        mockRedis.get.mockResolvedValue(null);
        const adapter = createMockAdapter({
            getStatus: vi.fn().mockReturnValue({
                available: false,
                consecutiveFailures: 5,
                circuitBreakerOpen: true,
                lastSuccessAt: null,
                lastFailureAt: new Date(),
                lastErrorMessage: 'timeout',
            }),
        });
        mockRegistry.find.mockReturnValue(adapter);
        mockCreateExecution.mockResolvedValue('exec-2');
        mockMarkSkipped.mockResolvedValue(undefined);
        mockIncrementCounter.mockResolvedValue(undefined);

        await executeJob(PAYLOAD);

        expect(mockIncrementCounter).toHaveBeenCalledWith('run-1', 'skipped');
    });

    // ── Failure path (retries exhausted) ──────────────────────────────────────

    it('returns "failed" when all retries are exhausted', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockRegistry.find.mockReturnValue(createMockAdapter());
        mockRateLimiter.waitAndProceed.mockResolvedValue(0);
        mockDb.prompt.findUnique.mockResolvedValue({
            text: 'What is the best CRM?',
            language: 'en',
            geography: 'US',
        });
        mockCreateExecution.mockResolvedValue('exec-3');
        const engineError = new EngineError('API timeout', 'chatgpt', 'timeout', true);
        mockExecuteWithRetry.mockRejectedValue(engineError);
        mockMarkFailed.mockResolvedValue(undefined);
        mockIncrementCounter.mockResolvedValue(undefined);

        const result = await executeJob(PAYLOAD);

        expect(result.status).toBe('failed');
        expect(result.executionId).toBe('exec-3');
        expect(result.error).toBe('API timeout');
    });

    it('marks execution as failed when all retries are exhausted', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockRegistry.find.mockReturnValue(createMockAdapter());
        mockRateLimiter.waitAndProceed.mockResolvedValue(0);
        mockDb.prompt.findUnique.mockResolvedValue({
            text: 'What is the best CRM?',
            language: 'en',
            geography: 'US',
        });
        mockCreateExecution.mockResolvedValue('exec-3');
        const engineError = new EngineError('API timeout', 'chatgpt', 'timeout', true);
        mockExecuteWithRetry.mockRejectedValue(engineError);
        mockMarkFailed.mockResolvedValue(undefined);
        mockIncrementCounter.mockResolvedValue(undefined);

        await executeJob(PAYLOAD);

        expect(mockMarkFailed).toHaveBeenCalledWith('exec-3', engineError, 3);
    });

    it('increments the "failed" run counter when all retries are exhausted', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockRegistry.find.mockReturnValue(createMockAdapter());
        mockRateLimiter.waitAndProceed.mockResolvedValue(0);
        mockDb.prompt.findUnique.mockResolvedValue({
            text: 'What is the best CRM?',
            language: 'en',
            geography: 'US',
        });
        mockCreateExecution.mockResolvedValue('exec-3');
        const engineError = new EngineError('API timeout', 'chatgpt', 'timeout', true);
        mockExecuteWithRetry.mockRejectedValue(engineError);
        mockMarkFailed.mockResolvedValue(undefined);
        mockIncrementCounter.mockResolvedValue(undefined);

        await executeJob(PAYLOAD);

        expect(mockIncrementCounter).toHaveBeenCalledWith('run-1', 'failed');
    });

    // ── Rate limiting ─────────────────────────────────────────────────────────

    it('waits for rate limit before executing', async () => {
        setupSuccessPath();

        await executeJob(PAYLOAD);

        expect(mockRateLimiter.waitAndProceed).toHaveBeenCalledWith('chatgpt', {
            requestsPerMinute: 60,
            requestsPerDay: 5000,
            cooldownMs: 1000,
        });
    });

    // ── Prompt not found ──────────────────────────────────────────────────────

    it('returns "failed" when prompt is not found in DB', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockRegistry.find.mockReturnValue(createMockAdapter());
        mockRateLimiter.waitAndProceed.mockResolvedValue(0);
        mockDb.prompt.findUnique.mockResolvedValue(null);

        const result = await executeJob(PAYLOAD);

        expect(result.status).toBe('failed');
        expect(result.error).toBe('prompt_not_found');
    });
});
