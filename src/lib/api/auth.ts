/**
 * API authentication helpers (brand-scoped, one-user-one-brand per CLAUDE.md).
 *
 * Resolves the signed-in {@link User} from the NextAuth session (database
 * strategy) — and transparently supports the dev-bypass session. Route handlers
 * call {@link getCurrentUser}; if it returns null, respond 401.
 *
 * There are no workspaces or roles: every query is filtered by the user's id and
 * their single brand, so a user can only ever read/write their own data.
 */

import type { User } from '@prisma/client';
import { db } from '@/lib/db';
import { getServerSession } from '@/lib/auth/utils';

/** The dev-bypass session's synthetic id (see auth/config.ts). */
const DEV_BYPASS_ID = 'dev-bypass-user';

/**
 * Resolve the currently signed-in user from the session, or null when there is
 * no valid session / matching user.
 *
 * Real database sessions carry the user id; the dev-bypass session carries only
 * an email, so we fall back to an email lookup.
 */
export async function getCurrentUser(): Promise<User | null> {
    const session = await getServerSession();
    const sessionUser = session?.user;
    if (!sessionUser) {
        return null;
    }

    const id = (sessionUser as { id?: string }).id;
    if (id && id !== DEV_BYPASS_ID) {
        const byId = await db.user.findUnique({ where: { id } });
        if (byId) {
            return byId;
        }
    }

    if (sessionUser.email) {
        return db.user.findUnique({ where: { email: sessionUser.email } });
    }

    return null;
}

/**
 * Resolve the current user's brand (with competitors + active prompts), or null
 * when unauthenticated or not yet onboarded. Convenience for the read routes.
 */
export async function getCurrentBrand(userId: string) {
    return db.brand.findUnique({
        where: { userId },
        include: {
            competitors: { orderBy: { createdAt: 'asc' } },
            prompts: { orderBy: { createdAt: 'asc' } },
        },
    });
}
