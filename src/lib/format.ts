/**
 * Shared number formatting utilities.
 *
 * Locale-aware formatting for large numbers and percentages displayed
 * in the dashboard. Uses Intl.NumberFormat under the hood.
 */

/**
 * Format a number with locale-aware thousand separators.
 *
 * @example formatNumber(1234)    → "1,234"
 * @example formatNumber(50)      → "50"
 * @example formatNumber(1000000) → "1,000,000"
 */
export function formatNumber(
    value: number,
    locale: string = 'en-US',
): string {
    return new Intl.NumberFormat(locale, {
        maximumFractionDigits: 0,
    }).format(value);
}

/**
 * Format a number as a percentage string (without the % symbol).
 * Removes trailing ".0" for clean integers.
 *
 * @example formatPercent(50)    → "50"
 * @example formatPercent(33.3)  → "33.3"
 * @example formatPercent(100.0) → "100"
 */
export function formatPercent(value: number): string {
    if (Number.isInteger(value)) {
        return value.toString();
    }
    return value.toFixed(1);
}

/**
 * Format a number with at most one decimal place, locale-aware.
 *
 * @example formatDecimal(1234.5) → "1,234.5"
 * @example formatDecimal(42)     → "42"
 */
export function formatDecimal(
    value: number,
    locale: string = 'en-US',
): string {
    return new Intl.NumberFormat(locale, {
        maximumFractionDigits: 1,
    }).format(value);
}
