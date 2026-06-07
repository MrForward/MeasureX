/**
 * Cloudflare R2 object storage — raw AI response storage.
 *
 * Stores immutable raw responses with SHA-256 checksums for data integrity.
 * Falls back to PostgreSQL JSONB when R2 is unavailable or misconfigured.
 *
 * Validates: Requirement 19.5 (checksum stored for data integrity)
 * Validates: Requirement 8.6  (checksum verification on read)
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { db } from '@/lib/db';
import type { EngineId } from '@/types';
import type { StandardizedResponse } from '@/lib/engines/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoreRawResponseParams {
    executionId: string;
    workspaceId: string;
    engine: EngineId;
    response: StandardizedResponse;
}

export interface StorageResult {
    /** e.g. "responses/ws-123/chatgpt/exec-456.json" */
    objectKey: string;
    /** SHA-256 hex digest of the stored content */
    checksum: string;
}

// ── Stored content shape ──────────────────────────────────────────────────────

interface StoredPayload {
    executionId: string;
    workspaceId: string;
    engine: string;
    storedAt: string;
    response: StandardizedResponse;
}

// ── R2 client singleton ───────────────────────────────────────────────────────

let _r2Client: S3Client | null = null;

/**
 * Lazy-initialized S3 client configured for Cloudflare R2.
 * Returns null when R2 credentials are not configured.
 */
function getR2Client(): S3Client | null {
    if (_r2Client) return _r2Client;

    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
        return null;
    }

    _r2Client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
    });

    return _r2Client;
}

// ── Exported for testing ──────────────────────────────────────────────────────

/** Reset the singleton (used in tests to inject a mock client). */
export function _resetR2Client(): void {
    _r2Client = null;
}

/** Inject a pre-built client (used in tests). */
export function _setR2Client(client: S3Client): void {
    _r2Client = client;
}

// ── Checksum ──────────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 checksum of a string.
 * Uses Node.js built-in `crypto` — no extra packages required.
 *
 * Validates: Requirement 19.5 (checksum stored for data integrity)
 */
export function computeChecksum(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
}

// ── Object key ────────────────────────────────────────────────────────────────

/**
 * Build a deterministic object key for an execution.
 * Deterministic keys enable deduplication — re-storing the same execution
 * overwrites the previous object rather than creating a duplicate.
 */
function buildObjectKey(workspaceId: string, engine: EngineId, executionId: string): string {
    return `responses/${workspaceId}/${engine}/${executionId}.json`;
}

// ── DB fallback ───────────────────────────────────────────────────────────────

/**
 * Store the serialized payload in PostgreSQL as a fallback when R2 is
 * unavailable. Updates the execution record's rawResponseRef with a
 * "db:..." prefix so callers can detect the storage location, and writes the
 * full serialized content to `rawResponseBody` so the extraction stage can
 * retrieve it later (without R2, this is the only place the raw text lives).
 */
async function storeInDb(
    executionId: string,
    objectKey: string,
    content: string,
): Promise<void> {
    const dbKey = `db:${objectKey}`;
    try {
        await db.execution.update({
            where: { id: executionId },
            data: { rawResponseRef: dbKey, rawResponseBody: content },
        });
    } catch (err) {
        // Best-effort — log but never throw
        console.error('[r2] DB fallback write failed for execution', executionId, err);
    }
}

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Store a raw AI response in R2 (or DB fallback) and return the object key
 * and SHA-256 checksum.
 *
 * Retry logic: up to 3 attempts on PutObject failure.
 * Fallback: if all retries fail (or R2 is not configured), store in PostgreSQL.
 *
 * Never throws — always returns a StorageResult.
 *
 * Validates: Requirement 19.5 (checksum stored for data integrity)
 */
export async function storeRawResponse(params: StoreRawResponseParams): Promise<StorageResult> {
    const { executionId, workspaceId, engine, response } = params;

    const objectKey = buildObjectKey(workspaceId, engine, executionId);

    const payload: StoredPayload = {
        executionId,
        workspaceId,
        engine,
        storedAt: new Date().toISOString(),
        response,
    };

    const content = JSON.stringify(payload);
    const checksum = computeChecksum(content);

    const client = getR2Client();

    if (!client) {
        console.warn('[r2] R2 credentials not configured — falling back to DB storage');
        await storeInDb(executionId, objectKey, content);
        return { objectKey: `db:${objectKey}`, checksum };
    }

    const bucketName = process.env.R2_BUCKET_NAME ?? 'measurex-responses';
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await client.send(
                new PutObjectCommand({
                    Bucket: bucketName,
                    Key: objectKey,
                    Body: content,
                    ContentType: 'application/json',
                    Metadata: {
                        checksum,
                        executionId,
                        workspaceId,
                        engine,
                    },
                }),
            );
            // Success — return the R2 key
            return { objectKey, checksum };
        } catch (err) {
            if (attempt < maxAttempts) {
                console.warn(`[r2] PutObject attempt ${attempt} failed, retrying…`, err);
            } else {
                console.warn(
                    `[r2] All ${maxAttempts} PutObject attempts failed — falling back to DB storage`,
                    err,
                );
                await storeInDb(executionId, objectKey, content);
                return { objectKey: `db:${objectKey}`, checksum };
            }
        }
    }

    // TypeScript requires a return here; the loop above always returns or falls through
    await storeInDb(executionId, objectKey, content);
    return { objectKey: `db:${objectKey}`, checksum };
}

/**
 * Retrieve a raw response by object key.
 * Returns null when the object is not found or R2 is unavailable.
 *
 * Validates: Requirement 8.6 (checksum verification on read)
 */
export async function getRawResponse(objectKey: string): Promise<string | null> {
    const client = getR2Client();
    if (!client) {
        console.warn('[r2] R2 credentials not configured — cannot retrieve object');
        return null;
    }

    const bucketName = process.env.R2_BUCKET_NAME ?? 'measurex-responses';

    try {
        const result = await client.send(
            new GetObjectCommand({
                Bucket: bucketName,
                Key: objectKey,
            }),
        );

        if (!result.Body) return null;

        // result.Body is a ReadableStream / Blob in different environments
        const body = result.Body as { transformToString?: () => Promise<string>; text?: () => Promise<string> };

        if (typeof body.transformToString === 'function') {
            return await body.transformToString();
        }
        if (typeof body.text === 'function') {
            return await body.text();
        }

        return null;
    } catch (err: unknown) {
        // NoSuchKey — object does not exist
        const awsErr = err as { name?: string; Code?: string };
        if (awsErr?.name === 'NoSuchKey' || awsErr?.Code === 'NoSuchKey') {
            return null;
        }
        console.error('[r2] GetObject failed for key', objectKey, err);
        return null;
    }
}

/**
 * Verify a stored response's checksum for data integrity.
 * Retrieves the object and compares its computed checksum against the expected value.
 *
 * Returns false when the object cannot be retrieved or checksums do not match.
 *
 * Validates: Requirement 8.6 (checksum verification on read)
 */
export async function verifyChecksum(
    objectKey: string,
    expectedChecksum: string,
): Promise<boolean> {
    const content = await getRawResponse(objectKey);
    if (content === null) return false;

    const actual = computeChecksum(content);
    return actual === expectedChecksum;
}

// ── Unified retrieval (R2 or DB fallback) ──────────────────────────────────────

/** The execution fields needed to locate a stored response. */
export interface StoredResponseSource {
    rawResponseRef: string | null;
    rawResponseBody: string | null;
}

/**
 * Retrieve the serialized stored-payload JSON for an execution, transparently
 * handling both backends:
 *   - "db:" fallback keys → read from the execution's `rawResponseBody` column
 *   - R2 object keys       → fetched from R2
 * Returns the JSON string, or null when the content is unavailable.
 */
export async function getStoredContent(
    source: StoredResponseSource,
): Promise<string | null> {
    const { rawResponseRef, rawResponseBody } = source;
    if (!rawResponseRef) return null;
    if (rawResponseRef.startsWith('db:')) {
        return rawResponseBody ?? null;
    }
    return getRawResponse(rawResponseRef);
}

/**
 * Parse a stored-payload JSON string back into its StandardizedResponse.
 * Returns null when the content is missing or unparseable (design edge case:
 * unparseable response → mark extraction failed, continue — Requirement 18.3).
 */
export function parseStoredResponse(
    content: string | null,
): StandardizedResponse | null {
    if (!content) return null;
    try {
        const payload = JSON.parse(content) as StoredPayload;
        return payload.response ?? null;
    } catch {
        return null;
    }
}
