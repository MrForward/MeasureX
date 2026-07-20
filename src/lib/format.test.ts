import { describe, expect, it } from 'vitest';
import { formatDecimal, formatNumber, formatPercent } from './format';

describe('formatNumber', () => {
    it('uses the default en-US grouping and rounds to a whole number', () => {
        expect(formatNumber(1_234_567.8)).toBe('1,234,568');
    });

    it('honors the requested locale', () => {
        expect(formatNumber(1_234_567.8, 'de-DE')).toBe('1.234.568');
    });
});

describe('formatPercent', () => {
    it('keeps integers clean without adding a percent sign', () => {
        expect(formatPercent(50)).toBe('50');
    });

    it('rounds fractional values to one decimal place', () => {
        expect(formatPercent(12.36)).toBe('12.4');
    });
});

describe('formatDecimal', () => {
    it('uses en-US grouping and rounds to at most one decimal place', () => {
        expect(formatDecimal(1_234.56)).toBe('1,234.6');
        expect(formatDecimal(42)).toBe('42');
    });

    it('honors the requested locale for grouping and decimals', () => {
        expect(formatDecimal(1_234.56, 'de-DE')).toBe('1.234,6');
    });
});
