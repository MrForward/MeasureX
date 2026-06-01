import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Badge — small pill-shaped status indicator.
 *
 * Variants:
 * - default: slate (neutral)
 * - brand:   purple (primary accents)
 * - success: green
 * - warning: amber
 * - error:   red
 * - outline: transparent with border
 */
const badgeVariants = cva(
    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2',
    {
        variants: {
            variant: {
                default: 'bg-slate-100 text-slate-700',
                brand: 'bg-brand-50 text-brand-700',
                success: 'bg-green-50 text-green-700',
                warning: 'bg-amber-50 text-amber-700',
                error: 'bg-red-50 text-red-700',
                outline: 'border border-slate-200 text-slate-700',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    },
);

export interface BadgeProps
    extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
    return (
        <span
            className={cn(badgeVariants({ variant }), className)}
            {...props}
        />
    );
}

export { Badge, badgeVariants };
