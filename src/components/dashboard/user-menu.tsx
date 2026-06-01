'use client';

import * as React from 'react';
import { signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { initialsFromUser } from './initials';
import type { DashboardUser } from './types';

interface UserMenuProps {
    user: DashboardUser;
}

/**
 * UserMenu — avatar + email row in the sidebar footer.
 * Click reveals a small popover with a "Sign out" button.
 */
export function UserMenu({ user }: UserMenuProps) {
    const [open, setOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!open) return;

        function handleClickOutside(event: MouseEvent) {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
                setOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    React.useEffect(() => {
        if (!open) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') setOpen(false);
        }

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open]);

    async function handleSignOut() {
        setOpen(false);
        await signOut({ callbackUrl: '/login' });
    }

    const initials = initialsFromUser(user.name, user.email);
    const displayLabel = user.name?.trim() || user.email;

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Open user menu"
                onClick={() => setOpen((v) => !v)}
                className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors',
                    'hover:bg-slate-50',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                )}
            >
                <span
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-semibold text-white"
                    aria-hidden="true"
                >
                    {initials}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">
                        {displayLabel}
                    </span>
                    {user.name?.trim() && (
                        <span className="block truncate text-xs text-slate-500">
                            {user.email}
                        </span>
                    )}
                </span>
            </button>

            {open && (
                <div
                    role="menu"
                    aria-label="Account menu"
                    className="absolute bottom-full left-0 right-0 z-20 mb-1.5 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
                >
                    <div className="px-2 py-2 border-b border-slate-100 mb-1">
                        <p className="truncate text-xs font-medium text-slate-900">
                            {displayLabel}
                        </p>
                        {user.name?.trim() && (
                            <p className="truncate text-xs text-slate-500">{user.email}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        role="menuitem"
                        onClick={handleSignOut}
                        className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-700 transition-colors',
                            'hover:bg-slate-50 hover:text-slate-900',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
                        )}
                    >
                        <LogOut aria-hidden="true" className="h-4 w-4 text-slate-500" />
                        Sign out
                    </button>
                </div>
            )}
        </div>
    );
}


