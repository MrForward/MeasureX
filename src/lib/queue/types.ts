import type { EngineId } from '@/types';

/**
 * Job payload types for the MeasureX queue system.
 *
 * Each type corresponds to a stage in the processing pipeline:
 *
 *   ExecutionJob       → call an AI engine for a single prompt
 *   ExtractionJob      → run entity extraction on a completed execution
 *   MetricsJob         → compute visibility scores for a completed run
 *   RecommendationJob  → generate recommendations after metrics are ready
 *   NotificationJob    → send in-app or email notifications
 */

/** Trigger a single AI engine execution for a prompt within a run. */
export interface ExecutionJobPayload {
    /** The run this execution belongs to. */
    runId: string;
    /** The prompt to execute. */
    promptId: string;
    /** The AI engine to query. */
    engine: EngineId;
    /** The workspace that owns this run. */
    workspaceId: string;
    /**
     * The pre-created execution record this job should process. The scheduler /
     * run trigger creates all execution rows (status 'pending') up front so the
     * completion check waits for the full set; the worker reuses this id rather
     * than creating a second row. Optional for backward compatibility — when
     * absent, executeJob creates the row itself.
     */
    executionId?: string;
}

/** Trigger entity extraction on a completed execution. */
export interface ExtractionJobPayload {
    /** The execution whose raw response should be extracted. */
    executionId: string;
    /** The workspace that owns this execution. */
    workspaceId: string;
}

/** Trigger visibility score computation after all extractions are done. */
export interface MetricsJobPayload {
    /** The run to compute metrics for. */
    runId: string;
    /** The workspace that owns this run. */
    workspaceId: string;
}

/** Trigger recommendation generation after metrics are computed. */
export interface RecommendationJobPayload {
    /** The run to generate recommendations for. */
    runId: string;
    /** The workspace that owns this run. */
    workspaceId: string;
}

/** Notification types supported by the notification job. */
export type NotificationType =
    | 'run_complete'
    | 'run_failed'
    | 'score_drop'
    | 'score_milestone'
    | 'engine_circuit_open'
    | 'budget_alert';

/** Send an in-app or email notification to a workspace member. */
export interface NotificationJobPayload {
    /** The notification category. */
    type: NotificationType;
    /** The workspace the notification belongs to. */
    workspaceId: string;
    /** The user to notify. */
    userId: string;
    /** Arbitrary notification-specific data (run ID, score delta, etc.). */
    data: Record<string, unknown>;
}

/** Union of all job payload types. */
export type JobPayload =
    | ExecutionJobPayload
    | ExtractionJobPayload
    | MetricsJobPayload
    | RecommendationJobPayload
    | NotificationJobPayload;
