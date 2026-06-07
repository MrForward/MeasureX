'use client';

import * as React from 'react';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotificationItem {
    id: string;
    type: string;
    content: { title?: string; message?: string; runId?: string } | null;
    read: boolean;
    createdAt: string;
}

/**
 * In-app notification bell (Requirement 6.5): unread count + dropdown list.
 * Polls the notifications API; marks all read when the dropdown is opened.
 */
export function NotificationBell() {
    const [items, setItems] = React.useState<NotificationItem[]>([]);
    const [unread, setUnread] = React.useState(0);
    const [open, setOpen] = React.useState(false);

    const load = React.useCallback(async () => {
        try {
            const res = await fetch('/api/v1/notifications', { cache: 'no-store' });
            if (!res.ok) return;
            const json = await res.json();
            setItems(json?.data?.notifications ?? []);
            setUnread(json?.data?.unreadCount ?? 0);
        } catch {
            // ignore transient errors
        }
    }, []);

    React.useEffect(() => {
        void load();
        const id = setInterval(load, 30_000); // light poll
        return () => clearInterval(id);
    }, [load]);

    async function toggle() {
        const next = !open;
        setOpen(next);
        if (next && unread > 0) {
            setUnread(0);
            try {
                await fetch('/api/v1/notifications/mark-read', { method: 'POST' });
                setItems((prev) => prev.map((n) => ({ ...n, read: true })));
            } catch {
                // ignore
            }
        }
    }

    return (
        <div className="relative">
            <button
                onClick={toggle}
                aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
                className="relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
                <Bell className="h-4 w-4" aria-hidden="true" />
                {unread > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-gradient px-1 text-[10px] font-semibold text-white">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
                    <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                        <div className="border-b border-slate-100 px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                            Notifications
                        </div>
                        {items.length === 0 ? (
                            <p className="px-3 py-6 text-center text-sm text-slate-400">
                                No notifications yet.
                            </p>
                        ) : (
                            <ul className="max-h-80 divide-y divide-slate-50 overflow-y-auto">
                                {items.map((n) => (
                                    <li
                                        key={n.id}
                                        className={cn(
                                            'px-3 py-2.5',
                                            !n.read && 'bg-brand-50/40',
                                        )}
                                    >
                                        <p className="text-sm font-medium text-slate-900">
                                            {n.content?.title ?? 'Notification'}
                                        </p>
                                        {n.content?.message && (
                                            <p className="mt-0.5 text-xs text-slate-500">{n.content.message}</p>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
