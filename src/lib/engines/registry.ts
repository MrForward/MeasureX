import type { EngineId } from '@/types';
import type { EngineAdapter, EngineStatus } from './types';

/**
 * Central registry for engine adapters.
 *
 * Acts as the single point of engine discovery — the Scheduler, Entity
 * Extractor, and Metric Engine all look up adapters here rather than
 * importing concrete adapter classes directly. Adding a new engine only
 * requires creating an adapter and calling `engineRegistry.register()`.
 *
 * Validates: Requirement 21.3 (Engine Extensibility — no changes to
 * Scheduler, Entity Extractor, or Metric Engine when adding a new engine)
 */
export class EngineRegistry {
    private readonly adapters = new Map<EngineId, EngineAdapter>();

    /**
     * Register an adapter by its `engineId`.
     * Overwrites any previously registered adapter for the same engine.
     */
    register(adapter: EngineAdapter): void {
        this.adapters.set(adapter.engineId, adapter);
    }

    /**
     * Retrieve an adapter by engine ID.
     * Throws a descriptive error if the engine is not registered.
     */
    get(engineId: EngineId): EngineAdapter {
        const adapter = this.adapters.get(engineId);
        if (adapter === undefined) {
            const available = Array.from(this.adapters.keys()).join(', ') || '(none)';
            throw new Error(
                `Engine '${engineId}' is not registered. Available engines: ${available}`,
            );
        }
        return adapter;
    }

    /**
     * Safe lookup — returns `null` instead of throwing when the engine is
     * not registered.
     */
    find(engineId: EngineId): EngineAdapter | null {
        return this.adapters.get(engineId) ?? null;
    }

    /** Returns all registered adapters in insertion order. */
    getAll(): EngineAdapter[] {
        return Array.from(this.adapters.values());
    }

    /** Returns all registered engine IDs in insertion order. */
    getEngineIds(): EngineId[] {
        return Array.from(this.adapters.keys());
    }

    /**
     * Returns a snapshot of the current status for every registered engine.
     * Useful for health-check endpoints and observability dashboards.
     */
    getAllStatuses(): Record<EngineId, EngineStatus> {
        const result = {} as Record<EngineId, EngineStatus>;
        this.adapters.forEach((adapter, id) => {
            result[id] = adapter.getStatus();
        });
        return result;
    }

    /** Returns `true` if an adapter is registered for the given engine ID. */
    has(engineId: EngineId): boolean {
        return this.adapters.has(engineId);
    }

    /**
     * Remove an adapter from the registry.
     * Primarily useful in tests to reset state between test cases.
     */
    unregister(engineId: EngineId): void {
        this.adapters.delete(engineId);
    }
}

/**
 * Application-wide singleton registry.
 *
 * Import this instance everywhere rather than constructing a new registry.
 * Concrete adapters (ChatGPT, Perplexity, Google AI) register themselves
 * during module initialisation so they are available before the first job runs.
 */
export const engineRegistry = new EngineRegistry();
