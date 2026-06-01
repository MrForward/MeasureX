'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export interface NavItemProps {
    href: string;
    icon: LucideIcon;
    label: string;
    /**
     * Optional badge count or label (e.g. unread notifications).
     * Falsy values (undefined, 0, '') are not rendered.
     */
    badge?: number | string;
    /**
     * Optional flag to match this item even when the user is on a nested route.
     * When true (default), `/prompts/abc` will activate the `/prompts` link.
     */
    matchNested?: boolean;
}

/**
 * NavItem — sidebar navigation link.
 *
 * Active state is computed from the current pathname. Active items get
 * a soft brand-50 background with brand-700 text; non-active items get
 * a subtle slate hover.
 *
 * Marked as a client component because `usePathname()` requires it.
 */
export function NavItem({
    href,
    icon: Icon,
    label,
    badge,
    matchNested = true,
}: NavItemProps) {
    const pathname = usePathname() ?? '';
    const isActive = matchNested
        ? pathname === href || pathname.startsWith(`${href}/`)
        : pathname === href;

    const showBadge = badge !== undefined && badge !== '' && badge !== 0;

    return (
        <Link
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900',
            )}
        >
            <Icon
                aria-hidden="true"
                className={cn(
                    'h-4 w-4 flex-shrink-0',
                    isActive
                        ? 'text-brand-600'
                        : 'text-slate-500 group-hover:text-slate-700',
                )}
            />
            <span className="flex-1 truncate">{label}</span>
            {showBadge && (
                <Badge variant={isActive ? 'brand' : 'default'} className="px-1.5 py-0 text-[10px]">
                    {badge}
                </Badge>
            )}
        </Link>
    );
}
