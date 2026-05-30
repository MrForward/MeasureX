/**
 * Queue module — Upstash Redis + QStash infrastructure.
 *
 * Usage:
 *   import { redis, qstash, publishJob } from '@/lib/queue';
 *   import type { ExecutionJobPayload } from '@/lib/queue';
 */

export { redis } from './redis';
export { qstash, publishJob } from './qstash';
export type {
    ExecutionJobPayload,
    ExtractionJobPayload,
    MetricsJobPayload,
    RecommendationJobPayload,
    NotificationJobPayload,
    NotificationType,
    JobPayload,
} from './types';
