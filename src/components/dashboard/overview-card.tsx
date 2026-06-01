import * as React from 'react';
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import type {
    ChangeClassification,
    WowChange,
} from '@/lib/metrics/change-detection';

/**
 * OverviewCard — single-stat card with optional week-over-week trend badge.
 *
 * Visual contract (white-dominant, purple accents):
 * - Label   : small, slate-500, uppercase, wide tracking
 * - Value   : big number, semibold, slate-900
 * - Unit    : small slate-500 next to the value (optional)
 * - Trend   : pill at the bottom — direction-tinted, with a magnitude qualifier
 *
 * Trend tinting follows the Metric_Engine non-determinism rules
 * (see src/lib/metrics/change-detection.ts):
 *   - within_normal_variance → subtle slate (don't alarm; it's LLM noise)
 *   - significant_shift     → bold purple (attention-grabbing)
 *   - notable / flat        → standard direction colour (green up, red down)
 *
 * Accessibility:
 * - The Card is wrapped in <article> with an aria-label so screen readers
 *   announce "Visibility Score, value 67/100, week over week change +8 points"
 *   rather than reading the layout pieces independently.
 *
 * Validates: Requirement 7.1 (overview panel: WoW trends visible)
 * Validates: Requirement 15.2 (within_normal_variance flagged subtly)
 * Validates: Requirement 15.4 (significant_shift surfaced prominently)
 */
export interface OverviewCardProps {
    /** Stat name shown above the value, e.g. "Visibility Score". */
    label: string;
    /** The value to display — strings already formatted, numbers rendered as-is. */
    value: string | number;
    /** Optional suffix attached to the value, e.g. "/100" or "%". */
    unit?: string;
    /**
     * Optional WoW change payload. When null/undefined, no trend pill renders.
     * `null` is the explicit "no comparison available" state (e.g. baseline run).
     */
    change?: WowChange | null;
    /** Override the change's own classification (rarely needed). */
    classification?: ChangeClassification;
    /** Forwarded to the outer Card for layout overrides. */
    className?: string;
}

export function OverviewCard({
    label,
    value,
    unit,
    change,
    classification,
    className,
}: OverviewCardProps) {
    const ariaLabel = buildAriaLabel(label, value, unit, change);

    return (
        <Card
            role="article"
            aria-label={ariaLabel}
            className={cn('p-5', className)}
        >
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                {label}
            </p>
            <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tabular-nums text-slate-900">
                    {value}
                </span>
                {unit && (
                    <span className="text-sm font-medium text-slate-500">
                        {unit}
                    </span>
                )}
            </div>
            <div className="mt-3 min-h-[1.5rem]">
                {change ? (
                    <TrendBadge
                        change={change}
                        classificationOverride={classification}
                    />
                ) : (
                    <span className="text-xs text-slate-400">No prior run yet</span>
                )}
            </div>
        </Card>
    );
}

// ── Internals ─────────────────────────────────────────────────────────────────

interface TrendBadgeProps {
    change: WowChange;
    classificationOverride?: ChangeClassification;
}

/**
 * Direction- and magnitude-aware delta pill.
 *
 * Treatment per change-detection rules:
 *   - within_normal_variance → subtle slate (this is LLM noise)
 *   - significant_shift      → bold purple ring + accent text
 *   - notable / flat         → green for up, red for down, slate for flat
 */
function TrendBadge({ change, classificationOverride }: TrendBadgeProps) {
    const classification = classificationOverride ?? change.classification;

    const Icon =
        change.direction === 'up'
            ? ArrowUp
            : change.direction === 'down'
                ? ArrowDown
                : ArrowRight;

    // Tone defaults to direction-coloured. "Within normal variance" overrides
    // it to slate, and a "significant shift" overrides it to purple.
    let tone =
        change.direction === 'up'
            ? 'bg-green-50 text-green-700'
            : change.direction === 'down'
                ? 'bg-red-50 text-red-700'
                : 'bg-slate-100 text-slate-600';

    if (classification === 'within_normal_variance') {
        tone = 'bg-slate-100 text-slate-600';
    }
    if (classification === 'significant_shift') {
        tone = 'bg-brand-50 text-brand-700 ring-1 ring-brand-200';
    }

    const sign = change.delta > 0 ? '+' : ''; // negatives carry their own sign
    const deltaLabel = `${sign}${formatDelta(change.delta)}`;
    const percentLabel =
        change.percentChange !== null ? ` (${formatPercent(change.percentChange)})` : '';
    const noiseLabel =
        classification === 'within_normal_variance' ? ' · normal variance' : '';
    const shiftLabel =
        classification === 'significant_shift' ? ' · significant' : '';

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                tone,
            )}
        >
            <Icon aria-hidden="true" className="h-3 w-3" />
            <span className="tabular-nums">
                {deltaLabel}
                {percentLabel}
            </span>
            {(noiseLabel || shiftLabel) && (
                <span className="hidden sm:inline">{noiseLabel || shiftLabel}</span>
            )}
        </span>
    );
}

/** Format a numeric delta — strip ".0" tails for whole numbers. */
function formatDelta(delta: number): string {
    if (Number.isInteger(delta)) {
        return delta.toString();
    }
    return delta.toFixed(1);
}

/** Format a percent change — already rounded to 1dp upstream. */
function formatPercent(percent: number): string {
    const sign = percent > 0 ? '+' : '';
    if (Number.isInteger(percent)) {
        return `${sign}${percent}%`;
    }
    return `${sign}${percent.toFixed(1)}%`;
}

/** Build a descriptive aria-label so screen readers get a complete picture. */
function buildAriaLabel(
    label: string,
    value: string | number,
    unit: string | undefined,
    change: WowChange | null | undefined,
): string {
    const valuePart = unit ? `${value}${unit}` : `${value}`;
    if (!change) {
        return `${label}: ${valuePart}. No prior run for comparison.`;
    }

    const directionWord =
        change.direction === 'up'
            ? 'up'
            : change.direction === 'down'
                ? 'down'
                : 'unchanged';
    const magnitude = Math.abs(change.delta);
    const percent =
        change.percentChange !== null
            ? `, ${Math.abs(change.percentChange)} percent`
            : '';
    const qualifier =
        change.classification === 'within_normal_variance'
            ? '. This is within normal variance.'
            : change.classification === 'significant_shift'
                ? '. This is a significant shift.'
                : '.';

    return `${label}: ${valuePart}, ${directionWord} ${magnitude} week over week${percent}${qualifier}`;
}
