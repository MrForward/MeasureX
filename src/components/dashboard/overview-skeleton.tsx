import * as React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

/**
 * OverviewSkeleton — animated loading placeholder that matches the populated
 * overview layout exactly to minimize layout shift.
 *
 * Renders:
 * - A page header skeleton (workspace name, heading, subtitle)
 * - A 4-card grid matching the OverviewCard layout
 * - A quick actions row skeleton
 */
export function OverviewSkeleton() {
    return (
        <div className="space-y-8">
            {/* Header skeleton */}
            <header className="space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-4 w-64" />
            </header>

            {/* 4-card grid skeleton */}
            <section aria-label="Loading overview" className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <CardSkeleton key={i} />
                    ))}
                </div>

                {/* Quick actions skeleton */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                    <Skeleton className="h-8 w-36 rounded-lg" />
                    <Skeleton className="h-8 w-40 rounded-lg" />
                    <Skeleton className="h-8 w-32 rounded-lg" />
                </div>
            </section>
        </div>
    );
}

/**
 * Individual card skeleton matching the OverviewCard layout:
 * - Label (small text)
 * - Value (large number)
 * - Trend badge (small pill)
 */
function CardSkeleton() {
    return (
        <Card className="p-5">
            <Skeleton className="h-3 w-24" />
            <div className="mt-2 flex items-baseline gap-1">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-4 w-8" />
            </div>
            <div className="mt-3">
                <Skeleton className="h-5 w-28 rounded-full" />
            </div>
        </Card>
    );
}
