import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Skeleton — animated pulse placeholder for loading states.
 *
 * Use for any element that needs a loading shimmer. The default surface is
 * slate-100, which sits well on the white-dominant theme.
 */
function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            aria-hidden="true"
            className={cn(
                'animate-pulse rounded-md bg-slate-100',
                className,
            )}
            {...props}
        />
    );
}

export { Skeleton };
