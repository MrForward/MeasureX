import type { DefaultSession } from 'next-auth';

/**
 * Extend the built-in NextAuth session types to include user.id.
 * This is required because the default Session type doesn't expose the DB user id.
 */
declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
        } & DefaultSession['user'];
    }
}
