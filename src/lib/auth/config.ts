import { PrismaAdapter } from '@auth/prisma-adapter';
import type { NextAuthOptions } from 'next-auth';
import EmailProvider from 'next-auth/providers/email';
import GoogleProvider from 'next-auth/providers/google';
import { db } from '@/lib/db';

const ADMIN_EMAIL = 'aibrain.play@gmail.com';

/**
 * NextAuth configuration object.
 * Route handler lives in src/app/api/auth/[...nextauth]/route.ts
 */
export const authConfig: NextAuthOptions = {
    // Cast required because @auth/prisma-adapter v2 types differ slightly from next-auth v4
    adapter: PrismaAdapter(db) as NextAuthOptions['adapter'],

    session: {
        strategy: 'database',
        maxAge: parseInt(process.env.AUTH_TOKEN_EXPIRY ?? '900', 10),
    },

    pages: {
        signIn: '/login',
        error: '/login',
    },

    providers: [
        EmailProvider({
            server: {
                host: 'smtp.resend.com',
                port: 465,
                auth: {
                    user: 'resend',
                    pass: process.env.RESEND_API_KEY ?? '',
                },
            },
            from: process.env.EMAIL_FROM ?? 'MeasureX <onboarding@resend.dev>',
        }),

        // Google OAuth is optional — only registered when credentials are present
        ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
            ? [
                GoogleProvider({
                    clientId: process.env.GOOGLE_CLIENT_ID,
                    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                }),
            ]
            : []),
    ],

    callbacks: {
        /**
         * Attach user.id to the session so downstream RBAC can use it.
         */
        async session({ session, user }) {
            if (session.user && user?.id) {
                session.user.id = user.id;
            }
            return session;
        },

        /**
         * Allow all sign-ins. Extend here for domain restrictions if needed.
         */
        async signIn() {
            return true;
        },
    },
};

/**
 * Dev bypass: returns a fake session for the admin account when
 * DEV_AUTH_BYPASS=true and NODE_ENV=development.
 *
 * This is consumed by getServerSession in utils.ts — it is NOT wired into
 * NextAuth itself (which would require a custom provider).
 */
export function isDevBypassEnabled(): boolean {
    return (
        process.env.NODE_ENV === 'development' &&
        process.env.DEV_AUTH_BYPASS === 'true'
    );
}

export function getDevBypassSession() {
    return {
        user: {
            id: 'dev-bypass-user',
            email: ADMIN_EMAIL,
            name: 'Dev Admin',
            image: null,
        },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
}
