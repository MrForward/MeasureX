/**
 * Unit tests for RBAC helpers.
 *
 * Requirement 1.3: viewer = read-only
 * Requirement 1.4: owner = full CRUD
 * Requirement 1.6: insufficient permissions message
 * Requirement 13.5: RBAC for all workspace operations
 */

import { describe, it, expect, vi } from 'vitest';

// Stub out server-side dependencies that are not needed for pure unit tests
vi.mock('@/lib/auth/utils', () => ({
    getServerSession: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
    db: {},
}));

import { hasRole } from './rbac';

describe('hasRole', () => {
    it('owner satisfies viewer requirement', () => {
        expect(hasRole('owner', 'viewer')).toBe(true);
    });

    it('viewer does not satisfy owner requirement', () => {
        expect(hasRole('viewer', 'owner')).toBe(false);
    });

    it('owner satisfies owner requirement', () => {
        expect(hasRole('owner', 'owner')).toBe(true);
    });

    it('viewer satisfies viewer requirement', () => {
        expect(hasRole('viewer', 'viewer')).toBe(true);
    });

    it('unknown role does not satisfy owner requirement', () => {
        expect(hasRole('unknown', 'owner')).toBe(false);
    });

    it('unknown role does not satisfy viewer requirement', () => {
        expect(hasRole('unknown', 'viewer')).toBe(false);
    });
});
