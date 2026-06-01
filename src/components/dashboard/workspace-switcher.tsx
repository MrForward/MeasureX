'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { initialsFromName } from './initials';
import type { WorkspaceSummary } from './types';

interface WorkspaceSwitcherProps {
    workspaces: WorkspaceSummary[];
    activeWorkspaceId: string | null;
}

/**
 * WorkspaceSwitcher — dropdown for picking the active workspace.
 *
 * Implementation note: keeps things dependency-free by hand-rolling a small
 * controlled dropdown rather than pulling in Radix UI for a single component.
 * Refactor later if we add more popovers and need consistent behavior.
 *
 * Accessibility:
 * - Trigger is a real <button> with aria-haspopup, aria-expanded
 * - Menu is closed on outside click and Escape
 * - Each option is a real <a> (Next.js Link) so keyboard nav and middle-click work
 */
export function WorkspaceSwitcher({
    workspaces,
    activeWorkspaceId,
}: WorkspaceSwitcherProps) {
    const [open, setOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    // Close on outside click
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

    // Close on Escape
    React.useEffect(() => {
        if (!open) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') setOpen(false);
        }

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open]);

    const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
        ?? workspaces[0]
        ?? null;

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label="Switch workspace"
                onClick={() => setOpen((v) => !v)}
                disabled={workspaces.length === 0 && !activeWorkspace}
                className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm transition-colors',
                    'hover:bg-slate-50',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                )}
            >
                <span className="flex min-w-0 items-center gap-2">
                    <span
                        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-brand-gradient text-[11px] font-semibold text-white"
                        aria-hidden="true"
                    >
                        {activeWorkspace ? initialsFromName(activeWorkspace.name) : '?'}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                        {activeWorkspace ? activeWorkspace.name : 'No workspace'}
                    </span>
                </span>
                <ChevronsUpDown
                    aria-hidden="true"
                    className="h-4 w-4 flex-shrink-0 text-slate-400"
                />
            </button>

            {open && (
                <div
                    role="listbox"
                    aria-label="Workspaces"
                    className="absolute left-0 right-0 z-20 mt-1.5 max-h-80 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
                >
                    {workspaces.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-500">
                            No workspaces yet.
                        </p>
                    ) : (
                        workspaces.map((workspace) => {
                            const isActive = workspace.id === activeWorkspace?.id;
                            return (
                                <Link
                                    key={workspace.id}
                                    href={`/dashboard?workspace=${workspace.id}`}
                                    role="option"
                                    aria-selected={isActive}
                                    onClick={() => setOpen(false)}
                                    className={cn(
                                        'flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors',
                                        'hover:bg-slate-50',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
                                    )}
                                >
                                    <span
                                        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-brand-gradient text-[11px] font-semibold text-white"
                                        aria-hidden="true"
                                    >
                                        {initialsFromName(workspace.name)}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                                        {workspace.name}
                                    </span>
                                    <Badge
                                        variant={workspace.role === 'owner' ? 'brand' : 'default'}
                                        className="text-[10px]"
                                    >
                                        {workspace.role}
                                    </Badge>
                                    {isActive && (
                                        <Check
                                            aria-hidden="true"
                                            className="h-4 w-4 flex-shrink-0 text-brand-600"
                                        />
                                    )}
                                </Link>
                            );
                        })
                    )}

                    <div className="my-1 h-px bg-slate-100" role="separator" />

                    <Link
                        href="/dashboard/workspaces/new"
                        onClick={() => setOpen(false)}
                        className={cn(
                            'flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-slate-700 transition-colors',
                            'hover:bg-slate-50 hover:text-slate-900',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
                        )}
                    >
                        <span
                            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-dashed border-slate-300 text-slate-500"
                            aria-hidden="true"
                        >
                            <Plus className="h-3.5 w-3.5" />
                        </span>
                        Create workspace
                    </Link>
                </div>
            )}
        </div>
    );
}


