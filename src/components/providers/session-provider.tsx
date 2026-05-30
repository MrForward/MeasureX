'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';

interface SessionProviderProps {
    children: React.ReactNode;
    session?: Session | null;
}

/**
 * Thin wrapper around NextAuth's SessionProvider.
 * Must be a Client Component because it uses React context.
 */
export function SessionProvider({ children, session }: SessionProviderProps) {
    return (
        <NextAuthSessionProvider session={session}>
            {children}
        </NextAuthSessionProvider>
    );
}
