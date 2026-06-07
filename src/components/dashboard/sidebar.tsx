'use client';

import * as React from 'react';
import Link from 'next/link';
import {
    LayoutDashboard,
    Lightbulb,
    MessageSquare,
    Settings,
    Users,
} from 'lucide-react';
import { NavItem } from './nav-item';
import { WorkspaceSwitcher } from './workspace-switcher';
import { UserMenu } from './user-menu';
import { NotificationBell } from './notification-bell';
import type { DashboardUser, WorkspaceSummary } from './types';

interface SidebarProps {
    workspaces: WorkspaceSummary[];
    activeWorkspaceId: string | null;
    user: DashboardUser;
}

/**
 * Sidebar — primary navigation shell for the dashboard.
 *
 * Client component — it passes lucide icon components to the (client) NavItem,
 * which a Server Component cannot do (functions/components aren't serializable
 * across the RSC boundary). Its props (workspaces, user) are all serializable,
 * so the layout can still fetch them on the server and pass them down.
 *
 * Layout:
 * - Logo wordmark
 * - Workspace switcher
 * - Nav items (Dashboard, Prompts, Competitors, Recommendations, Settings)
 * - User menu (bottom)
 */
export function Sidebar({ workspaces, activeWorkspaceId, user }: SidebarProps) {
    return (
        <aside
            aria-label="Primary"
            className="hidden md:flex w-60 flex-shrink-0 flex-col border-r border-slate-200 bg-white"
        >
            {/* Logo + notifications */}
            <div className="flex h-16 items-center justify-between px-4">
                <Link
                    href="/dashboard"
                    aria-label="MeasureX home"
                    className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
                >
                    <span
                        className="h-7 w-7 rounded-lg bg-brand-gradient"
                        aria-hidden="true"
                    />
                    <span className="text-base font-semibold tracking-tight text-slate-900">
                        MeasureX
                    </span>
                </Link>
                <NotificationBell />
            </div>

            {/* Workspace switcher */}
            <div className="px-3 pb-3">
                <WorkspaceSwitcher
                    workspaces={workspaces}
                    activeWorkspaceId={activeWorkspaceId}
                />
            </div>

            {/* Nav */}
            <nav aria-label="Dashboard" className="flex-1 overflow-y-auto px-3">
                <ul className="space-y-0.5">
                    <li>
                        <NavItem
                            href="/dashboard"
                            icon={LayoutDashboard}
                            label="Dashboard"
                            matchNested={false}
                        />
                    </li>
                    <li>
                        <NavItem
                            href="/dashboard/prompts"
                            icon={MessageSquare}
                            label="Prompts"
                        />
                    </li>
                    <li>
                        <NavItem
                            href="/dashboard/competitors"
                            icon={Users}
                            label="Competitors"
                        />
                    </li>
                    <li>
                        <NavItem
                            href="/dashboard/recommendations"
                            icon={Lightbulb}
                            label="Recommendations"
                        />
                    </li>
                    <li>
                        <NavItem
                            href="/dashboard/settings"
                            icon={Settings}
                            label="Settings"
                        />
                    </li>
                </ul>
            </nav>

            {/* User menu */}
            <div className="mt-auto border-t border-slate-100 p-3">
                <UserMenu user={user} />
            </div>
        </aside>
    );
}
