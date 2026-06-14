import { getServerSession as nextAuthGetServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authConfig, isDevBypassEnabled, getDevBypassSession } from './config';
import type { Session } from 'next-auth';

/**
 * Server-side session retrieval.
 * Respects DEV_AUTH_BYPASS in development so you can work without real auth.
 */
export async function getServerSession(): Promise<Session | null> {
    if (isDevBypassEnabled()) {
        return getDevBypassSession() as Session;
    }
    return nextAuthGetServerSession(authConfig);
}

/**
 * Asserts the current request is authenticated.
 * Redirects to /login (with callbackUrl) if not.
 *
 * @param redirectTo - Optional path to redirect back to after login.
 *                     Defaults to the current page (handled by middleware).
 */
export async function requireAuth(redirectTo?: string): Promise<Session> {
    const session = await getServerSession();

    if (!session) {
        const loginUrl = redirectTo
            ? `/login?callbackUrl=${encodeURIComponent(redirectTo)}`
            : '/login';
        redirect(loginUrl);
    }

    return session;
}
