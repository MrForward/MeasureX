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

export const qstash =
    globalForQStash.qstash ??
    new Client({
        token: process.env.QSTASH_TOKEN!,
    });

if (process.env.NODE_ENV !== 'production') {
    globalForQStash.qstash = qstash;
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
 * @param topic   - The job type / QStash URL group name
 * @param payload - The job payload (will be JSON-serialised)
 */
export async function publishJob(topic: string, payload: object): Promise<void> {
    const baseUrl =
        process.env.APP_URL ??
        (process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : 'http://localhost:3000');

    const url = `${baseUrl}/api/jobs/${topic}`;

    await qstash.publishJSON({
        url,
        body: payload,
        retries: 3,
    });
}
