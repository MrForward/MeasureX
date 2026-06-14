/**
 * Unit tests for scan eligibility guard rails (PRD §F9).
 */

import { describe, it, expect } from 'vitest';
import { evaluateScanEligibility, SCAN_RATE_LIMIT_MS } from './eligibility';

const NOW = new Date('2026-06-10T12:00:00Z');

describe('evaluateScanEligibility', () => {
    it('allows a scan for an active sub with no running scan and no recent scan', () => {
        const r = evaluateScanEligibility({
            subscriptionStatus: 'active',
            hasRunningScan: false,
            lastScanStartedAt: null,
            now: NOW,
        });
        expect(r.allowed).toBe(true);
    });

    it('blocks when the subscription is not active', () => {
        for (const status of ['inactive', 'canceled', 'past_due']) {
            const r = evaluateScanEligibility({
                subscriptionStatus: status,
                hasRunningScan: false,
                lastScanStartedAt: null,
                now: NOW,
            });
            expect(r.allowed).toBe(false);
            expect(r.code).toBe('SUBSCRIPTION_INACTIVE');
        }
    });

    it('blocks when a scan is already running', () => {
        const r = evaluateScanEligibility({
            subscriptionStatus: 'active',
            hasRunningScan: true,
            lastScanStartedAt: null,
            now: NOW,
        });
        expect(r.allowed).toBe(false);
        expect(r.code).toBe('SCAN_IN_PROGRESS');
    });

    it('blocks (rate limit) when the last scan started under an hour ago', () => {
        const r = evaluateScanEligibility({
            subscriptionStatus: 'active',
            hasRunningScan: false,
            lastScanStartedAt: new Date(NOW.getTime() - 10 * 60 * 1000), // 10 min ago
            now: NOW,
        });
        expect(r.allowed).toBe(false);
        expect(r.code).toBe('RATE_LIMITED');
        expect(r.retryAfterMs).toBe(SCAN_RATE_LIMIT_MS - 10 * 60 * 1000);
    });

    it('allows when the last scan started over an hour ago', () => {
        const r = evaluateScanEligibility({
            subscriptionStatus: 'active',
            hasRunningScan: false,
            lastScanStartedAt: new Date(NOW.getTime() - 61 * 60 * 1000),
            now: NOW,
        });
        expect(r.allowed).toBe(true);
    });

    it('prioritizes subscription > running > rate limit', () => {
        // inactive AND running AND recent → reports subscription first
        const r = evaluateScanEligibility({
            subscriptionStatus: 'canceled',
            hasRunningScan: true,
            lastScanStartedAt: NOW,
            now: NOW,
        });
        expect(r.code).toBe('SUBSCRIPTION_INACTIVE');
    });
});
