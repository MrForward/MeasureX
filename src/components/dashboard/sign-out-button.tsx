'use client';

import { signOut } from 'next-auth/react';

export function SignOutButton() {
    return (
        <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="font-medium text-slate-600 transition-colors hover:text-slate-900"
        >
            Sign out
        </button>
    );
}
