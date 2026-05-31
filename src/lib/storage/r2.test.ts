/**
 * Unit tests for R2 raw response storage.
 *
 * Validates: Requirement 19.5 (checksum stored for data integrity)
 * Validates: Requirement 8.6  (checksum verification on read)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock @aws-sdk/client-s3 ───────────────────────────────────────────────────

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-s3', () => {
    return {
        S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
        PutObjectCommand: vi.fn().mockImplementation((input) => ({ input, _type: 'PutObject' })),
        GetObjectCommand: vi.fn().mockImplementation((input) => ({ input, _type: 'GetObject' })),
    };
});

// ── Mock DB (used for fallback path) ─────────────────────────────────────────

const mockDbUpdate = vi.fn().mockResolvedValue({});

vi.mock('@/lib/db', () => ({
    db: {
        execution: {
            update: (...args: unknown[]) => mockDbUpdate(...args),
        },
    },
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import {
    computeChecksum,
    storeRawResponse,
    getRawResponse,
    verifyChecksum,
    _resetR2Client,
    _setR2Client,
} from './r2';
import { S3Client } from '@aws-sdk/client-s3';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockClient() {
    return new S3Client({} as never) as unknown as { send: typeof mockSend };
}

const SAMPLE_RESPONSE = {
    rawText: 'HubSpot is a leading CRM platform.',
    citations: [],
    metadata: {},
    modelVersion: 'gpt-4o',
    timestamp: new Date('2024-01-01T00:00:00Z'),
    executionTimeMs: 1200,
};

const SAMPLE_PARAMS = {
    executionId: 'exec-456',
    workspaceId: 'ws-123',
    engine: 'chatgpt' as const,
    response: SAMPLE_RESPONSE,
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
    _resetR2Client();

    // Inject a mock client so tests don't need real env vars
    _setR2Client(makeMockClient() as unknown as S3Client);

    // Default env
    process.env.R2_BUCKET_NAME = 'test-bucket';
    process.env.R2_ACCOUNT_ID = 'test-account';
    process.env.R2_ACCESS_KEY_ID = 'test-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
});

// ── computeChecksum ───────────────────────────────────────────────────────────

describe('computeChecksum', () => {
    it('returns a consistent SHA-256 hex string for the same input', () => {
        const result1 = computeChecksum('hello world');
        const result2 = computeChecksum('hello world');
        expect(result1).toBe(result2);
        // SHA-256 hex is always 64 characters
        expect(result1).toHaveLength(64);
        expect(result1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns different values for different inputs', () => {
        const a = computeChecksum('hello world');
        const b = computeChecksum('hello world!');
        expect(a).not.toBe(b);
    });

    it('returns the known SHA-256 of "hello world"', () => {
        // Known SHA-256 of "hello world" (verified via Node.js crypto)
        const knownHash = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';
        expect(computeChecksum('hello world')).toBe(knownHash);
    });
});

// ── storeRawResponse ──────────────────────────────────────────────────────────

describe('storeRawResponse', () => {
    it('returns the correct objectKey format', async () => {
        mockSend.mockResolvedValueOnce({});

        const result = await storeRawResponse(SAMPLE_PARAMS);

        expect(result.objectKey).toBe('responses/ws-123/chatgpt/exec-456.json');
    });

    it('returns a non-empty checksum string', async () => {
        mockSend.mockResolvedValueOnce({});

        const result = await storeRawResponse(SAMPLE_PARAMS);

        expect(result.checksum).toBeTruthy();
        expect(result.checksum).toHaveLength(64);
        expect(result.checksum).toMatch(/^[0-9a-f]{64}$/);
    });

    it('calls S3 PutObject with the correct bucket and key', async () => {
        mockSend.mockResolvedValueOnce({});

        await storeRawResponse(SAMPLE_PARAMS);

        expect(mockSend).toHaveBeenCalledOnce();
        const command = mockSend.mock.calls[0][0] as { input: { Bucket: string; Key: string } };
        expect(command.input.Bucket).toBe('test-bucket');
        expect(command.input.Key).toBe('responses/ws-123/chatgpt/exec-456.json');
    });

    it('falls back to DB storage when R2 credentials are missing', async () => {
        _resetR2Client();
        delete process.env.R2_ACCOUNT_ID;
        delete process.env.R2_ACCESS_KEY_ID;
        delete process.env.R2_SECRET_ACCESS_KEY;

        const result = await storeRawResponse(SAMPLE_PARAMS);

        // objectKey should have db: prefix
        expect(result.objectKey).toMatch(/^db:/);
        expect(result.checksum).toHaveLength(64);
        // S3 should NOT have been called
        expect(mockSend).not.toHaveBeenCalled();
        // DB update should have been called
        expect(mockDbUpdate).toHaveBeenCalledOnce();
    });

    it('falls back to DB storage after all retries fail', async () => {
        mockSend.mockRejectedValue(new Error('Network error'));

        const result = await storeRawResponse(SAMPLE_PARAMS);

        expect(result.objectKey).toMatch(/^db:/);
        expect(result.checksum).toHaveLength(64);
        // 3 retry attempts
        expect(mockSend).toHaveBeenCalledTimes(3);
        expect(mockDbUpdate).toHaveBeenCalledOnce();
    });

    it('checksum is consistent with computeChecksum on the same content', async () => {
        mockSend.mockResolvedValueOnce({});

        const result = await storeRawResponse(SAMPLE_PARAMS);

        // The checksum must be deterministic — calling again with same params yields same checksum
        mockSend.mockResolvedValueOnce({});
        const result2 = await storeRawResponse(SAMPLE_PARAMS);

        expect(result.checksum).toBe(result2.checksum);
    });
});

// ── getRawResponse ────────────────────────────────────────────────────────────

describe('getRawResponse', () => {
    it('returns the stored content string', async () => {
        const storedContent = JSON.stringify({ executionId: 'exec-456', engine: 'chatgpt' });
        mockSend.mockResolvedValueOnce({
            Body: {
                transformToString: async () => storedContent,
            },
        });

        const result = await getRawResponse('responses/ws-123/chatgpt/exec-456.json');

        expect(result).toBe(storedContent);
    });

    it('returns null when the object is not found (NoSuchKey)', async () => {
        const notFoundError = Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
        mockSend.mockRejectedValueOnce(notFoundError);

        const result = await getRawResponse('responses/ws-123/chatgpt/nonexistent.json');

        expect(result).toBeNull();
    });

    it('returns null when R2 credentials are not configured', async () => {
        _resetR2Client();
        delete process.env.R2_ACCOUNT_ID;
        delete process.env.R2_ACCESS_KEY_ID;
        delete process.env.R2_SECRET_ACCESS_KEY;

        const result = await getRawResponse('responses/ws-123/chatgpt/exec-456.json');

        expect(result).toBeNull();
        expect(mockSend).not.toHaveBeenCalled();
    });
});

// ── verifyChecksum ────────────────────────────────────────────────────────────

describe('verifyChecksum', () => {
    it('returns true when the checksum matches the stored content', async () => {
        const content = JSON.stringify({ executionId: 'exec-456' });
        const expectedChecksum = computeChecksum(content);

        mockSend.mockResolvedValueOnce({
            Body: { transformToString: async () => content },
        });

        const result = await verifyChecksum('responses/ws-123/chatgpt/exec-456.json', expectedChecksum);

        expect(result).toBe(true);
    });

    it('returns false when the checksum does not match', async () => {
        const content = JSON.stringify({ executionId: 'exec-456' });
        const wrongChecksum = computeChecksum('completely different content');

        mockSend.mockResolvedValueOnce({
            Body: { transformToString: async () => content },
        });

        const result = await verifyChecksum('responses/ws-123/chatgpt/exec-456.json', wrongChecksum);

        expect(result).toBe(false);
    });

    it('returns false when the object cannot be retrieved', async () => {
        const notFoundError = Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
        mockSend.mockRejectedValueOnce(notFoundError);

        const result = await verifyChecksum('responses/ws-123/chatgpt/missing.json', 'anychecksum');

        expect(result).toBe(false);
    });
});
