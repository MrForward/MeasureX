import { Client } from '@upstash/qstash';

/**
 * QStash client for publishing jobs to the message queue.
 *
 * QStash is a serverless message queue that works with Vercel's serverless
 * architecture. Unlike BullMQ, it does not require a persistent worker
 * process — QStash calls your Next.js API route handlers directly via HTTP.
 *
 * Required env vars:
 *   QSTASH_TOKEN — Authorization token from the Upstash console
 *
 * Job flow:
 *   1. publishJob() sends a message to QStash
 *   2. QStash delivers the message to the configured webhook endpoint
 *   3. The Next.js API route handler processes the job
 *   4. QStash retries on non-2xx responses (up to 3 times by default)
 */

const globalForQStash = globalThis as unknown as {
    qstash: Client | undefined;
};

/** True when QStash credentials are present (production / configured envs). */
const qstashConfigured = Boolean(process.env.QSTASH_TOKEN);

/**
 * QStash client — only constructed when a token is configured. In local dev
 * (no token) we deliver jobs in-process instead (see publishJob), so the client
 * is never needed and we avoid constructing it with an undefined token.
 */
export const qstash =
    globalForQStash.qstash ??
    (qstashConfigured ? new Client({ token: process.env.QSTASH_TOKEN! }) : undefined);

if (process.env.NODE_ENV !== 'production' && qstash) {
    globalForQStash.qstash = qstash;
}

/** Max delay (seconds) we actually wait for in local in-process delivery. */
const LOCAL_MAX_DELAY_SECONDS = 2;

/**
 * Max concurrent in-process job deliveries in local dev.
 *
 * QStash paces delivery; our shim would otherwise fire an entire run's jobs
 * (execute + extract + metrics) at once, stampeding a free-tier database's
 * connection pool and causing transaction timeouts. Bounding concurrency keeps
 * local runs reliable. Real (QStash-backed) deploys are unaffected.
 */
const MAX_LOCAL_CONCURRENCY = 4;

let activeLocal = 0;
const localQueue: Array<() => void> = [];

/** Start queued deliveries up to the concurrency cap. */
function pumpLocal(): void {
    while (activeLocal < MAX_LOCAL_CONCURRENCY && localQueue.length > 0) {
        const job = localQueue.shift()!;
        activeLocal++;
        job();
    }
}

/**
 * Deliver a job in-process by POSTing to the local route handler.
 *
 * QStash delivers jobs by calling a public URL from Upstash's servers, which
 * cannot reach `http://localhost`. So in local dev we emulate that delivery
 * with a fetch to our own route, through a bounded-concurrency queue so we
 * don't overwhelm the database. Errors are logged, never thrown — this mirrors
 * QStash's async, non-blocking publish semantics.
 */
function deliverLocally(url: string, payload: object, delaySeconds?: number): void {
    const wait =
        delaySeconds && delaySeconds > 0
            ? Math.min(delaySeconds, LOCAL_MAX_DELAY_SECONDS) * 1000
            : 0;

    const job = () => {
        const doFetch = () =>
            fetch(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
            })
                .catch((err) => {
                    console.error(`[queue] local in-process delivery failed for ${url}:`, err);
                })
                .finally(() => {
                    activeLocal--;
                    pumpLocal();
                });

        if (wait > 0) {
            setTimeout(doFetch, wait);
        } else {
            void doFetch();
        }
    };

    localQueue.push(job);
    pumpLocal();
}

/**
 * Publish a job to QStash.
 *
 * The `topic` maps to a URL group in QStash (e.g. "execute", "extract",
 * "metrics", "recommendations", "notifications"). Each topic is configured
 * in the Upstash console to point at the corresponding API route.
 *
 * In production the destination URL is derived from VERCEL_URL. In
 * development you can override it by setting APP_URL in .env.local.
 *
 * @param topic         - The job type / QStash URL group name
 * @param payload       - The job payload (will be JSON-serialised)
 * @param delaySeconds  - Optional delay before QStash delivers the message (for run distribution)
 */
export async function publishJob(
    topic: string,
    payload: object,
    delaySeconds?: number,
): Promise<void> {
    const baseUrl =
        process.env.APP_URL ??
        (process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : 'http://localhost:3000');

    const url = `${baseUrl}/api/jobs/${topic}`;

    // Local dev (no QStash token): deliver in-process — QStash can't reach localhost.
    if (!qstashConfigured || !qstash) {
        deliverLocally(url, payload, delaySeconds);
        return;
    }

    await qstash.publishJSON({
        url,
        body: payload,
        retries: 3,
        ...(delaySeconds !== undefined && delaySeconds > 0 ? { delay: delaySeconds } : {}),
    });
}
