/**
 * Unit tests for EngineRegistry.
 *
 * Validates: Requirement 21.3 — adding a new engine requires no changes to
 * Scheduler, Entity Extractor, or Metric Engine; the registry is the single
 * point of engine discovery.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { EngineId } from '@/types';
import type {
    EngineExecutionResult,
    EngineStatus,
    RateLimitConfig,
    StandardizedResponse,
    PromptInput,
    ExecutionContext,
} from './types';
import { BaseEngineAdapter } from './base-adapter';
import { EngineRegistry } from './registry';

// ── Mock Adapter ──────────────────────────────────────────────────────────────

/**
 * Minimal concrete adapter used only in tests.
 * Extends BaseEngineAdapter so circuit-breaker state is exercised via getStatus().
 */
class MockAdapter extends BaseEngineAdapter {
    readonly engineId: EngineId;
    readonly engineName: string;

    constructor(id: EngineId, name: string) {
        super();
        this.engineId = id;
        this.engineName = name;
    }

    async execute(
        _prompt: PromptInput,
        _context?: ExecutionContext,
    ): Promise<EngineExecutionResult> {
        return {
            success: true,
            response: this.parseResponse({}),
        };
    }

    parseResponse(_raw: unknown): StandardizedResponse {
        return {
            rawText: '',
            citations: [],
            metadata: {},
            modelVersion: 'mock-1.0',
            timestamp: new Date(),
            executionTimeMs: 0,
        };
    }

    getRateLimits(): RateLimitConfig {
        return { requestsPerMinute: 60, requestsPerDay: 1000, cooldownMs: 1000 };
    }

    getCostPerCall(): number {
        return 0.001;
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdapter(id: EngineId, name?: string): MockAdapter {
    return new MockAdapter(id, name ?? id);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EngineRegistry', () => {
    let registry: EngineRegistry;

    beforeEach(() => {
        // Use a fresh registry per test to avoid cross-test pollution
        registry = new EngineRegistry();
    });

    // ── register / get ────────────────────────────────────────────────────────

    it('registers an adapter and retrieves it by ID', () => {
        const adapter = makeAdapter('chatgpt');
        registry.register(adapter);

        const retrieved = registry.get('chatgpt');
        expect(retrieved).toBe(adapter);
    });

    it('overwrites a previously registered adapter for the same engine', () => {
        const first = makeAdapter('chatgpt', 'First');
        const second = makeAdapter('chatgpt', 'Second');

        registry.register(first);
        registry.register(second);

        expect(registry.get('chatgpt').engineName).toBe('Second');
    });

    // ── get — error path ──────────────────────────────────────────────────────

    it('get() throws when the engine is not registered', () => {
        expect(() => registry.get('chatgpt')).toThrow(
            "Engine 'chatgpt' is not registered",
        );
    });

    it('get() error message lists available engines', () => {
        registry.register(makeAdapter('perplexity'));
        registry.register(makeAdapter('google_ai'));

        let message = '';
        try {
            registry.get('chatgpt');
        } catch (err) {
            message = (err as Error).message;
        }

        expect(message).toContain('perplexity');
        expect(message).toContain('google_ai');
    });

    it('get() error message says "(none)" when registry is empty', () => {
        let message = '';
        try {
            registry.get('chatgpt');
        } catch (err) {
            message = (err as Error).message;
        }
        expect(message).toContain('(none)');
    });

    // ── find ──────────────────────────────────────────────────────────────────

    it('find() returns the adapter when registered', () => {
        const adapter = makeAdapter('perplexity');
        registry.register(adapter);

        expect(registry.find('perplexity')).toBe(adapter);
    });

    it('find() returns null when engine is not registered', () => {
        expect(registry.find('chatgpt')).toBeNull();
    });

    // ── has ───────────────────────────────────────────────────────────────────

    it('has() returns true after registration', () => {
        registry.register(makeAdapter('google_ai'));
        expect(registry.has('google_ai')).toBe(true);
    });

    it('has() returns false before registration', () => {
        expect(registry.has('chatgpt')).toBe(false);
    });

    it('has() returns false after unregistration', () => {
        registry.register(makeAdapter('chatgpt'));
        registry.unregister('chatgpt');
        expect(registry.has('chatgpt')).toBe(false);
    });

    // ── getAll ────────────────────────────────────────────────────────────────

    it('getAll() returns all registered adapters', () => {
        const a = makeAdapter('chatgpt');
        const b = makeAdapter('perplexity');
        const c = makeAdapter('google_ai');

        registry.register(a);
        registry.register(b);
        registry.register(c);

        const all = registry.getAll();
        expect(all).toHaveLength(3);
        expect(all).toContain(a);
        expect(all).toContain(b);
        expect(all).toContain(c);
    });

    it('getAll() returns an empty array when nothing is registered', () => {
        expect(registry.getAll()).toEqual([]);
    });

    // ── getEngineIds ──────────────────────────────────────────────────────────

    it('getEngineIds() returns all registered IDs', () => {
        registry.register(makeAdapter('chatgpt'));
        registry.register(makeAdapter('perplexity'));

        const ids = registry.getEngineIds();
        expect(ids).toHaveLength(2);
        expect(ids).toContain('chatgpt');
        expect(ids).toContain('perplexity');
    });

    // ── getAllStatuses ────────────────────────────────────────────────────────

    it('getAllStatuses() returns a status entry for every registered engine', () => {
        registry.register(makeAdapter('chatgpt'));
        registry.register(makeAdapter('perplexity'));

        const statuses = registry.getAllStatuses();

        expect(Object.keys(statuses)).toHaveLength(2);
        expect(statuses).toHaveProperty('chatgpt');
        expect(statuses).toHaveProperty('perplexity');
    });

    it('getAllStatuses() returns correct EngineStatus shape', () => {
        registry.register(makeAdapter('chatgpt'));

        const statuses = registry.getAllStatuses();
        const status: EngineStatus = statuses['chatgpt'];

        expect(typeof status.available).toBe('boolean');
        expect(typeof status.consecutiveFailures).toBe('number');
        expect(typeof status.circuitBreakerOpen).toBe('boolean');
    });

    it('getAllStatuses() returns an empty object when nothing is registered', () => {
        expect(registry.getAllStatuses()).toEqual({});
    });

    // ── unregister ────────────────────────────────────────────────────────────

    it('unregister() removes the adapter so get() throws afterwards', () => {
        registry.register(makeAdapter('chatgpt'));
        registry.unregister('chatgpt');

        expect(() => registry.get('chatgpt')).toThrow("Engine 'chatgpt' is not registered");
    });

    it('unregister() is a no-op for an engine that was never registered', () => {
        // Should not throw
        expect(() => registry.unregister('chatgpt')).not.toThrow();
    });

    it('unregister() only removes the targeted engine', () => {
        registry.register(makeAdapter('chatgpt'));
        registry.register(makeAdapter('perplexity'));

        registry.unregister('chatgpt');

        expect(registry.has('chatgpt')).toBe(false);
        expect(registry.has('perplexity')).toBe(true);
    });
});
